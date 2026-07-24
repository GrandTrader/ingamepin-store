import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createPallyBill, getUsdRubRate } from "@/lib/pally";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validToken(token: string, storedHash: string) {
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      orderId?: unknown;
      accessToken?: unknown;
    };
    const orderId = String(body.orderId ?? "").trim();
    const accessToken = String(body.accessToken ?? "").trim();

    if (!orderId || accessToken.length < 40) {
      return NextResponse.json({ error: "Invalid order access." }, { status: 400 });
    }

    const admin = createAdminClient();
    const orderResult = await admin
      .from("orders")
      .select(
        "id, order_number, customer_email, total, currency, status, access_token_hash",
      )
      .eq("id", orderId)
      .maybeSingle();
    const order = orderResult.data;

    if (
      orderResult.error ||
      !order ||
      !order.access_token_hash ||
      !validToken(accessToken, order.access_token_hash)
    ) {
      return NextResponse.json({ error: "Order access was denied." }, { status: 403 });
    }

    if (order.status !== "PENDING_PAYMENT" || order.currency !== "USD") {
      return NextResponse.json(
        { error: "This order is not awaiting a USD payment." },
        { status: 400 },
      );
    }

    const paymentResult = await admin
      .from("payments")
      .select("id, method, status, gateway_order_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const payment = paymentResult.data;

    if (!payment || payment.method !== "PALLY" || payment.status !== "PENDING") {
      return NextResponse.json(
        { error: "This is not a pending Pally order." },
        { status: 400 },
      );
    }

    if (payment.gateway_order_id) {
      return NextResponse.json(
        { error: "A Pally payment link already exists for this order." },
        { status: 409 },
      );
    }

    const itemResult = await admin
      .from("order_items")
      .select(
        "product_id, product_name, unit_price, quantity, player_id, platform",
      )
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    if (itemResult.error || !itemResult.data?.length) {
      return NextResponse.json(
        { error: "Unable to prepare the Pally order items." },
        { status: 500 },
      );
    }

    const productIds = Array.from(
      new Set(itemResult.data.map((item) => item.product_id)),
    );
    const productResult = await admin
      .from("products")
      .select("id, category_id")
      .in("id", productIds);

    if (productResult.error) {
      return NextResponse.json(
        { error: "Unable to prepare the Pally product categories." },
        { status: 500 },
      );
    }

    const categoryIds = Array.from(
      new Set(
        (productResult.data ?? [])
          .map((product) => product.category_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const categoryResult = categoryIds.length
      ? await admin.from("categories").select("id, slug").in("id", categoryIds)
      : { data: [], error: null };

    if (categoryResult.error) {
      return NextResponse.json(
        { error: "Unable to prepare the Pally product categories." },
        { status: 500 },
      );
    }

    const categoryById = new Map(
      (categoryResult.data ?? []).map((category) => [
        category.id,
        category.slug,
      ]),
    );
    const categoryByProduct = new Map(
      (productResult.data ?? []).map((product) => [
        product.id,
        product.category_id
          ? categoryById.get(product.category_id) ?? "digital/games"
          : "digital/games",
      ]),
    );
    const usdSubtotal = itemResult.data.reduce(
      (total, item) =>
        total + Number(item.unit_price) * Number(item.quantity),
      0,
    );
    const discountFactor =
      usdSubtotal > 0 ? Number(order.total) / usdSubtotal : 1;
    const usdRubRate = await getUsdRubRate();
    const pallyItems = itemResult.data.map((item) => {
      const account = String(item.player_id ?? "").trim();
      const category = String(
        categoryByProduct.get(item.product_id) ?? "digital/games",
      );
      const extra: Record<string, string> = {};

      if (account) {
        if (/telegram|stars/i.test(`${item.product_name} ${category}`)) {
          extra.telegram_username = account;
        } else if (/steam/i.test(`${item.product_name} ${category}`)) {
          extra.steam_account = account;
        } else {
          extra.account = account;
        }
      }
      if (item.platform) extra.platform = String(item.platform);

      return {
        name: item.product_name,
        price: (
          Number(item.unit_price) *
          discountFactor *
          usdRubRate
        ).toFixed(2),
        category: category.includes("/")
          ? category
          : `digital/games/${category}`,
        quantity: String(item.quantity),
        extra,
      };
    });
    const rubAmount = pallyItems.reduce(
      (total, item) => total + Number(item.price) * Number(item.quantity),
      0,
    );

    const bill = await createPallyBill({
      amount: rubAmount,
      currency: "RUB",
      orderId: order.id,
      name: `InGamePin order ${order.order_number}`,
      description: `InGamePin order ${order.order_number}`,
      payerEmail: order.customer_email,
      items: pallyItems,
    });

    const updateResult = await admin
      .from("payments")
      .update({ gateway_order_id: bill.billId })
      .eq("id", payment.id)
      .is("gateway_order_id", null);

    if (updateResult.error) {
      return NextResponse.json(
        { error: "Unable to save the Pally payment link." },
        { status: 500 },
      );
    }

    return NextResponse.json({ checkoutUrl: bill.checkoutUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to start Pally.",
      },
      { status: 500 },
    );
  }
}
