import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type IpnBody = {
  payment_id?: string | number;
  invoice_id?: string | number;
  order_id?: string;
  payment_status?: string;
};

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObject((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

function validSignature(body: IpnBody, signature: string) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha512", secret)
    .update(JSON.stringify(sortObject(body)))
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
    const body = (await request.json()) as IpnBody;
    const signature = request.headers.get("x-nowpayments-sig") ?? "";

    if (!validSignature(body, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    if (String(body.payment_status ?? "").toLowerCase() !== "finished") {
      return NextResponse.json({ received: true });
    }

    const invoiceId = String(body.invoice_id ?? "").trim();
    const orderId = String(body.order_id ?? "").trim();
    const transactionId = String(body.payment_id ?? "").trim();

    if (!invoiceId || !orderId || !transactionId) {
      return NextResponse.json({ error: "Invalid payment data." }, { status: 400 });
    }

    const admin = createAdminClient();
    const paymentResult = await admin
      .from("payments")
      .select("id, order_id, status")
      .eq("order_id", orderId)
      .eq("gateway_order_id", invoiceId)
      .eq("method", "NOWPAYMENTS")
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
      p_prepay_id: invoiceId,
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
            : "Unable to process NOWPayments notification.",
      },
      { status: 500 },
    );
  }
}
