import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createNowPaymentsInvoice } from "@/lib/nowpayments";
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
        "id, order_number, total, currency, status, access_token_hash",
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

    if (
      !payment ||
      payment.method !== "NOWPAYMENTS" ||
      payment.status !== "PENDING"
    ) {
      return NextResponse.json(
        { error: "This is not a pending NOWPayments order." },
        { status: 400 },
      );
    }

    if (payment.gateway_order_id) {
      return NextResponse.json(
        { error: "A NOWPayments invoice already exists for this order." },
        { status: 409 },
      );
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    ).replace(/\/$/, "");
    const invoice = await createNowPaymentsInvoice({
      price_amount: Number(order.total),
      order_id: order.id,
      order_description: `InGamePin order ${order.order_number}`,
      ipn_callback_url: `${siteUrl}/api/nowpayments/webhook`,
      success_url: `${siteUrl}/checkout/success`,
      cancel_url: `${siteUrl}/checkout/payment`,
    });

    const updateResult = await admin
      .from("payments")
      .update({ gateway_order_id: String(invoice.id) })
      .eq("id", payment.id)
      .is("gateway_order_id", null);

    if (updateResult.error) {
      return NextResponse.json(
        { error: "Unable to save the NOWPayments invoice." },
        { status: 500 },
      );
    }

    return NextResponse.json({ checkoutUrl: invoice.invoice_url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start NOWPayments.",
      },
      { status: 500 },
    );
  }
}
