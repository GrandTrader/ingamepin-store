import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { getUsdtInvoice, type UsdtInvoice } from "@/lib/usdt-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validSignature(rawBody: string, timestamp: string, signature: string) {
  const secret = process.env.USDT_GATEWAY_CALLBACK_SECRET;
  if (!secret || !timestamp || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 300) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const actualBuffer = Buffer.from(signature.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function sendPaymentEmails(orderId: string) {
  const admin = createAdminClient();
  const orderResult = await admin
    .from("orders")
    .select("order_number, customer_name, customer_email, total, currency, status")
    .eq("id", orderId)
    .single();
  const itemResult = await admin
    .from("order_items")
    .select("id, product_name, option_name")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (orderResult.error || itemResult.error) return;

  const itemIds = (itemResult.data ?? []).map((item) => item.id);
  const codeResult = itemIds.length
    ? await admin
        .from("gift_card_codes")
        .select("order_item_id, code")
        .in("order_item_id", itemIds)
        .eq("status", "SOLD")
    : { data: [], error: null };
  if (codeResult.error) return;

  const deliveredItems = (itemResult.data ?? [])
    .map((item) => ({
      productName: item.product_name,
      optionName: item.option_name,
      codes: (codeResult.data ?? [])
        .filter((code) => code.order_item_id === item.id)
        .map((code) => code.code),
    }))
    .filter((item) => item.codes.length > 0);
  const order = orderResult.data;

  await sendOrderStatusEmails({
    event: "PAYMENT_APPROVED",
    orderNumber: order.order_number,
    customerName: order.customer_name ?? "Customer",
    customerEmail: order.customer_email,
    total: Number(order.total),
    currency: order.currency,
    orderStatus: order.status,
    deliveredItems,
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-gateway-timestamp") ?? "";
    const signature = request.headers.get("x-gateway-signature") ?? "";

    if (!validSignature(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as UsdtInvoice;
    if (body.status !== "PAID") {
      return NextResponse.json({ received: true });
    }
    if (!body.invoiceId || !body.orderId || !body.transactionHash) {
      return NextResponse.json({ error: "Invalid payment data." }, { status: 400 });
    }

    const verifiedInvoice = await getUsdtInvoice(body.invoiceId);
    if (
      verifiedInvoice.status !== "PAID" ||
      verifiedInvoice.orderId !== body.orderId ||
      verifiedInvoice.transactionHash !== body.transactionHash ||
      verifiedInvoice.amount !== body.amount ||
      verifiedInvoice.network !== body.network
    ) {
      return NextResponse.json(
        { error: "USDT payment verification failed." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const paymentResult = await admin
      .from("payments")
      .select("id, order_id, status, gateway_order_id")
      .eq("order_id", body.orderId)
      .eq("gateway_order_id", body.invoiceId)
      .eq("method", "USDT_DIRECT")
      .maybeSingle();
    const payment = paymentResult.data;

    if (!payment) {
      return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
    }
    if (payment.status === "VERIFIED") {
      return NextResponse.json({ received: true, alreadyCompleted: true });
    }

    const completion = await admin.rpc("complete_binance_payment", {
      p_payment_id: payment.id,
      p_prepay_id: body.invoiceId,
      p_transaction_id: body.transactionHash,
    });
    if (completion.error) {
      return NextResponse.json({ error: completion.error.message }, { status: 400 });
    }

    await prepareOrderForManualFulfillment(payment.order_id);
    await sendPaymentEmails(payment.order_id);
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process the USDT payment.",
      },
      { status: 500 },
    );
  }
}
