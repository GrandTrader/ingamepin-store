import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createFreeKassaCheckoutUrl } from "@/lib/freekassa";
import { getUsdRubRate } from "@/lib/pally";
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
        "id, customer_email, total, currency, status, access_token_hash",
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
      .select("id, method, status, gateway_order_id, gateway_payment_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const payment = paymentResult.data;

    if (
      paymentResult.error ||
      !payment ||
      payment.method !== "FREEKASSA" ||
      payment.status !== "PENDING"
    ) {
      return NextResponse.json(
        { error: "This is not a pending FreeKassa order." },
        { status: 400 },
      );
    }

    const rate = await getUsdRubRate();
    const rubAmount = (Number(order.total) * rate).toFixed(2);

    if (!Number.isFinite(Number(rubAmount)) || Number(rubAmount) <= 0) {
      return NextResponse.json(
        { error: "Unable to calculate the FreeKassa amount." },
        { status: 500 },
      );
    }

    if (
      payment.gateway_order_id &&
      (payment.gateway_order_id !== order.id ||
        Math.abs(Number(payment.gateway_payment_id) - Number(rubAmount)) > 0.005)
    ) {
      return NextResponse.json(
        { error: "The saved FreeKassa payment link is invalid." },
        { status: 409 },
      );
    }

    if (!payment.gateway_order_id) {
      const updateResult = await admin
        .from("payments")
        .update({
          gateway_order_id: order.id,
          gateway_payment_id: rubAmount,
        })
        .eq("id", payment.id)
        .is("gateway_order_id", null)
        .select("id")
        .maybeSingle();

      if (updateResult.error || !updateResult.data) {
        return NextResponse.json(
          { error: "Unable to save the FreeKassa payment link." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      checkoutUrl: createFreeKassaCheckoutUrl({
        amount: rubAmount,
        currency: "RUB",
        orderId: order.id,
        email: order.customer_email,
        language: "en",
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to start FreeKassa.",
      },
      { status: 500 },
    );
  }
}