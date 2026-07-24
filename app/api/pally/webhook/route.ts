import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { getPallyApiToken, getPallyBillStatus } from "@/lib/pally";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validSignature(amount: string, orderId: string, signature: string) {
  if (!amount || !orderId || !signature) return false;

  const expected = createHash("md5")
    .update(`${amount}:${orderId}:${getPallyApiToken()}`)
    .digest("hex")
    .toUpperCase();
  const actualBuffer = Buffer.from(signature.toUpperCase(), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function sendPaymentEmails(orderId: string) {
  const admin = createAdminClient();
  const orderResult = await admin
    .from("orders")
    .select(
      "order_number, customer_name, customer_email, total, currency, status",
    )
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
    const form = await request.formData();
    const orderId = String(form.get("InvId") ?? "").trim();
    const amount = String(form.get("OutSum") ?? "").trim();
    const currency = String(form.get("CurrencyIn") ?? "").trim().toUpperCase();
    const status = String(form.get("Status") ?? "").trim().toUpperCase();
    const transactionId = String(form.get("TrsId") ?? "").trim();
    const signature = String(form.get("SignatureValue") ?? "").trim();

    if (!validSignature(amount, orderId, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    if (status !== "SUCCESS") {
      return NextResponse.json({ received: true });
    }

    if (!orderId || !transactionId || currency !== "RUB") {
      return NextResponse.json({ error: "Invalid payment data." }, { status: 400 });
    }

    const admin = createAdminClient();
    const paymentResult = await admin
      .from("payments")
      .select("id, order_id, status, gateway_order_id")
      .eq("order_id", orderId)
      .eq("method", "PALLY")
      .maybeSingle();
    const payment = paymentResult.data;

    if (!payment) {
      return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
    }

    if (payment.status === "VERIFIED") {
      return NextResponse.json({ received: true, alreadyCompleted: true });
    }

    if (!payment.gateway_order_id) {
      return NextResponse.json({ error: "Pally bill was not found." }, { status: 400 });
    }

    const bill = await getPallyBillStatus(payment.gateway_order_id);
    if (
      String(bill.id ?? "") !== payment.gateway_order_id ||
      String(bill.order_id ?? "") !== orderId ||
      String(bill.status ?? "").toUpperCase() !== "SUCCESS" ||
      String(bill.currency_in ?? "").toUpperCase() !== currency ||
      Math.abs(Number(bill.amount) - Number(amount)) > 0.005
    ) {
      return NextResponse.json(
        { error: "Pally bill verification failed." },
        { status: 400 },
      );
    }

    const completion = await admin.rpc("complete_binance_payment", {
      p_payment_id: payment.id,
      p_prepay_id: payment.gateway_order_id,
      p_transaction_id: transactionId,
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
            : "Unable to process the Pally notification.",
      },
      { status: 500 },
    );
  }
}
