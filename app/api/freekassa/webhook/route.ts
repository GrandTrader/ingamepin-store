import { NextRequest, NextResponse } from "next/server";

import { sendOrderStatusEmails } from "@/lib/email";
import { verifyFreeKassaNotification } from "@/lib/freekassa";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { notifyPaidOrderInTelegram } from "@/lib/telegram-order-notification";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FREEKASSA_NOTIFICATION_IPS = new Set([
  "168.119.157.136",
  "168.119.60.227",
  "178.154.197.79",
  "51.250.54.238",
]);

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  );
}

function plainText(value: string, status = 200) {
  return new NextResponse(value, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
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
    orderId,
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
    const sourceIp = clientIp(request);
    if (!FREEKASSA_NOTIFICATION_IPS.has(sourceIp)) {
      return plainText("Invalid source.", 403);
    }

    const form = await request.formData();
    const merchantId = String(form.get("MERCHANT_ID") ?? "").trim();
    const amount = String(form.get("AMOUNT") ?? "").trim();
    const orderId = String(form.get("MERCHANT_ORDER_ID") ?? "").trim();
    const transactionId = String(form.get("intid") ?? "").trim();
    const signature = String(form.get("SIGN") ?? "").trim();

    if (
      !verifyFreeKassaNotification({
        merchantId,
        amount,
        orderId,
        signature,
      })
    ) {
      return plainText("Invalid signature.", 401);
    }

    if (!orderId || !transactionId || !Number.isFinite(Number(amount))) {
      return plainText("Invalid payment data.", 400);
    }

    const admin = createAdminClient();
    const paymentResult = await admin
      .from("payments")
      .select(
        "id, order_id, status, gateway_order_id, gateway_payment_id",
      )
      .eq("order_id", orderId)
      .eq("method", "FREEKASSA")
      .maybeSingle();
    const payment = paymentResult.data;

    if (paymentResult.error) {
      return plainText(paymentResult.error.message, 400);
    }

    if (!payment) {
      const topupResult = await admin
        .from("wallet_topup_requests")
        .select("id, status, gateway_order_id, payment_reference")
        .eq("id", orderId)
        .eq("payment_method", "FREEKASSA")
        .maybeSingle();
      const topup = topupResult.data;

      if (topupResult.error || !topup) {
        return plainText("Payment was not found.", 404);
      }
      if (topup.status === "APPROVED") {
        return plainText("YES");
      }
      if (
        topup.gateway_order_id !== orderId ||
        Math.abs(Number(topup.payment_reference) - Number(amount)) > 0.005
      ) {
        return plainText("Wallet payment verification failed.", 400);
      }

      const walletCompletion = await admin.rpc(
        "complete_wallet_gateway_topup",
        {
          p_request_id: topup.id,
          p_gateway_order_id: orderId,
          p_transaction_id: transactionId,
        },
      );
      return walletCompletion.error
        ? plainText(walletCompletion.error.message, 400)
        : plainText("YES");
    }

    if (payment.status === "VERIFIED") {
      return plainText("YES");
    }

    if (
      payment.gateway_order_id !== orderId ||
      Math.abs(Number(payment.gateway_payment_id) - Number(amount)) > 0.005
    ) {
      return plainText("Payment verification failed.", 400);
    }

    const completion = await admin.rpc("complete_binance_payment", {
      p_payment_id: payment.id,
      p_prepay_id: orderId,
      p_transaction_id: transactionId,
    });

    if (completion.error) {
      return plainText(completion.error.message, 400);
    }

    await prepareOrderForManualFulfillment(payment.order_id);
    await sendPaymentEmails(payment.order_id);
    await notifyPaidOrderInTelegram(payment.order_id);
    return plainText("YES");
  } catch (error) {
    return plainText(
      error instanceof Error
        ? error.message
        : "Unable to process the FreeKassa notification.",
      500,
    );
  }
}
