import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { notifyPaidOrderInTelegram } from "@/lib/telegram-order-notification";
import { getUsdtInvoice } from "@/lib/usdt-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validToken(token: string, storedHash: string) {
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

async function sendPaymentEmails(orderId: string) {
  const admin = createAdminClient();
  const [orderResult, itemResult] = await Promise.all([
    admin
      .from("orders")
      .select("order_number, customer_name, customer_email, total, currency, status")
      .eq("id", orderId)
      .single(),
    admin
      .from("order_items")
      .select("id, product_name, option_name")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);
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

  const order = orderResult.data;
  await sendOrderStatusEmails({
    orderId,
    event: "PAYMENT_APPROVED",
    orderNumber: order.order_number,
    customerName: order.customer_name ?? "Customer",
    customerEmail: order.customer_email,
    total: Number(order.total),
    currency: order.currency,
    orderStatus: order.status,
    deliveredItems: (itemResult.data ?? [])
      .map((item) => ({
        productName: item.product_name,
        optionName: item.option_name,
        codes: (codeResult.data ?? [])
          .filter((code) => code.order_item_id === item.id)
          .map((code) => code.code),
      }))
      .filter((item) => item.codes.length > 0),
  });
}

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get("orderId")?.trim() ?? "";
    const accessToken =
      request.nextUrl.searchParams.get("accessToken")?.trim() ?? "";

    if (!orderId || accessToken.length < 40) {
      return NextResponse.json({ error: "Invalid order access." }, { status: 400 });
    }

    const admin = createAdminClient();
    const orderResult = await admin
      .from("orders")
      .select("id, status, access_token_hash")
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

    const paymentResult = await admin
      .from("payments")
      .select("id, method, status, gateway_order_id, transaction_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const payment = paymentResult.data;

    if (
      paymentResult.error ||
      !payment ||
      payment.method !== "USDT_DIRECT" ||
      !payment.gateway_order_id
    ) {
      return NextResponse.json({ error: "USDT invoice was not found." }, { status: 404 });
    }

    const invoice = await getUsdtInvoice(payment.gateway_order_id);
    let paymentStatus = payment.status;

    // Reconcile a paid gateway invoice here as a fallback when its webhook is
    // delayed or missed. The completion RPC is the same guarded operation used
    // by the webhook, so refreshing the page cannot fulfill the order twice.
    if (
      invoice.status === "PAID" &&
      invoice.transactionHash &&
      payment.status !== "VERIFIED"
    ) {
      const completion = await admin.rpc("complete_binance_payment", {
        p_payment_id: payment.id,
        p_prepay_id: invoice.invoiceId,
        p_transaction_id: invoice.transactionHash,
      });

      if (completion.error) {
        const refreshedPayment = await admin
          .from("payments")
          .select("status")
          .eq("id", payment.id)
          .single();
        if (refreshedPayment.data?.status !== "VERIFIED") {
          throw new Error(completion.error.message);
        }
      } else {
        await prepareOrderForManualFulfillment(order.id);
        await sendPaymentEmails(order.id);
        await notifyPaidOrderInTelegram(order.id);
      }

      paymentStatus = "VERIFIED";
    }

    return NextResponse.json({
      invoice,
      orderStatus: order.status,
      paymentStatus,
      transactionId: invoice.transactionHash ?? payment.transaction_id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to check the USDT payment.",
      },
      { status: 500 },
    );
  }
}
