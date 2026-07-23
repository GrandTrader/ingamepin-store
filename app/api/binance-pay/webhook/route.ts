import { verify } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { callBinancePay } from "@/lib/binance-pay";
import { sendEmail, sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type BinanceCertificate = {
  certSerial: string;
  certPublic: string;
};

type BinanceWebhook = {
  bizType?: string;
  bizId?: string;
  bizStatus?: string;
  data?: string | Record<string, unknown>;
};

type BinanceWebhookData = {
  bizStatus?: string;
  prepayId?: string;
  transactionId?: string;
  merchantTradeNo?: string;
};

type BinanceOrderQuery = {
  prepayId: string;
  transactionId?: string;
  merchantTradeNo: string;
  status: string;
};

async function sendBinanceDeliveryEmails(orderId: string) {
  const admin = createAdminClient();
  const orderResult = await admin
    .from("orders")
    .select(
      "order_number, customer_name, customer_email, total, currency, status"
    )
    .eq("id", orderId)
    .single();

  if (orderResult.error) {
    console.error("Binance email order lookup failed:", orderResult.error);
    return;
  }

  const itemResult = await admin
    .from("order_items")
    .select("id, product_name, option_name")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemResult.error) {
    console.error("Binance email item lookup failed:", itemResult.error);
    return;
  }

  const itemIds = (itemResult.data ?? []).map((item) => item.id);
  const codeResult = itemIds.length
    ? await admin
        .from("gift_card_codes")
        .select("order_item_id, code")
        .in("order_item_id", itemIds)
        .eq("status", "SOLD")
        .order("sold_at", { ascending: true })
    : { data: [], error: null };

  if (codeResult.error) {
    console.error("Binance email code lookup failed:", codeResult.error);
    return;
  }

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
  const emailResults = await sendOrderStatusEmails({
    event: "PAYMENT_APPROVED",
    orderNumber: order.order_number,
    customerName: order.customer_name ?? "Customer",
    customerEmail: order.customer_email,
    total: Number(order.total),
    currency: order.currency,
    orderStatus: order.status,
    deliveredItems,
  });

  emailResults.forEach((emailResult, index) => {
    if (emailResult.status === "rejected") {
      console.error(
        index === 0
          ? "Customer Binance delivery email failed:"
          : "Admin Binance delivery email failed:",
        emailResult.reason
      );
    }
  });
}

async function sendBinanceWalletEmails(
  userId: string,
  amount: number,
  balanceAfter: number
) {
  const admin = createAdminClient();
  const userResult = await admin.auth.admin.getUserById(userId);
  const email = userResult.data.user?.email;

  if (!email) {
    console.error("Binance wallet customer email was not found.");
    return;
  }

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
  const balanceLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(balanceAfter);
  const results = await Promise.allSettled([
    sendEmail({
      to: email,
      subject: "InGamePin wallet credited through Binance Pay",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a"><h1>Wallet credited</h1><p>Your Binance Pay payment was confirmed.</p><p><strong>${amountLabel}</strong> has been added to your InGamePin wallet.</p><p>Available balance: <strong>${balanceLabel}</strong></p><a href="https://ingamepin.com/account/wallet">Open wallet</a></div>`,
      text: `${amountLabel} was added to your InGamePin wallet through Binance Pay. Balance: ${balanceLabel}.`,
    }),
    sendEmail({
      to: "support@ingamepin.com",
      subject: `Binance wallet top-up completed - ${amountLabel}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a"><h1>Binance wallet top-up completed</h1><p>Customer: <strong>${email}</strong></p><p>Amount credited: <strong>${amountLabel}</strong></p><p>New balance: <strong>${balanceLabel}</strong></p></div>`,
      text: `Binance wallet top-up completed for ${email}. Amount: ${amountLabel}. New balance: ${balanceLabel}.`,
    }),
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        index === 0
          ? "Customer Binance wallet email failed:"
          : "Admin Binance wallet email failed:",
        result.reason
      );
    }
  });
}

function failure(message: string, status = 400) {
  return NextResponse.json(
    {
      returnCode: "FAIL",
      returnMessage: message,
    },
    { status }
  );
}

function readWebhookData(webhook: BinanceWebhook): BinanceWebhookData {
  if (typeof webhook.data === "string") {
    return JSON.parse(webhook.data) as BinanceWebhookData;
  }

  return (webhook.data ?? {}) as BinanceWebhookData;
}

export async function POST(request: NextRequest) {
  try {
    const timestamp = request.headers.get("BinancePay-Timestamp") ?? "";
    const nonce = request.headers.get("BinancePay-Nonce") ?? "";
    const certificateSerial =
      request.headers.get("BinancePay-Certificate-SN") ?? "";
    const signature = request.headers.get("BinancePay-Signature") ?? "";

    if (!timestamp || !nonce || !certificateSerial || !signature) {
      return failure("Missing Binance Pay signature headers.", 401);
    }

    const timestampNumber = Number(timestamp);

    if (
      !Number.isFinite(timestampNumber) ||
      Math.abs(Date.now() - timestampNumber) > 5 * 60 * 1000
    ) {
      return failure("Expired Binance Pay notification.", 401);
    }

    const rawBody = await request.text();
    const certificates = await callBinancePay<BinanceCertificate[]>(
      "/binancepay/openapi/certificates",
      {}
    );
    const certificate = certificates.find(
      (item) => item.certSerial === certificateSerial
    );

    if (!certificate) {
      return failure("Unknown Binance Pay certificate.", 401);
    }

    const signedPayload = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const validSignature = verify(
      "RSA-SHA256",
      Buffer.from(signedPayload, "utf8"),
      certificate.certPublic,
      Buffer.from(signature, "base64")
    );

    if (!validSignature) {
      return failure("Invalid Binance Pay signature.", 401);
    }

    const webhook = JSON.parse(rawBody) as BinanceWebhook;
    const webhookData = readWebhookData(webhook);
    const webhookStatus = webhookData.bizStatus ?? webhook.bizStatus;

    // Valid non-payment notifications are acknowledged without changing data.
    if (webhook.bizType !== "PAY" || webhookStatus !== "PAY_SUCCESS") {
      return NextResponse.json({
        returnCode: "SUCCESS",
        returnMessage: null,
      });
    }

    const webhookPrepayId = String(webhookData.prepayId ?? "").trim();
    const merchantTradeNo = String(
      webhookData.merchantTradeNo ?? ""
    ).trim();

    if (!webhookPrepayId && !merchantTradeNo) {
      return failure("Binance order reference is missing.");
    }

    // Never trust the webhook body alone. Confirm the order with Binance.
    const binanceOrder = await callBinancePay<BinanceOrderQuery>(
      "/binancepay/openapi/v2/order/query",
      webhookPrepayId
        ? { prepayId: webhookPrepayId }
        : { merchantTradeNo }
    );

    if (
      binanceOrder.status !== "PAID" ||
      (webhookPrepayId &&
        binanceOrder.prepayId !== webhookPrepayId) ||
      (merchantTradeNo &&
        binanceOrder.merchantTradeNo !== merchantTradeNo) ||
      !binanceOrder.transactionId
    ) {
      return failure("Binance order is not confirmed as paid.");
    }

    const admin = createAdminClient();
    const paymentResult = await admin
      .from("payments")
      .select("id, order_id")
      .eq("gateway_order_id", binanceOrder.prepayId)
      .eq("method", "BINANCE_PAY")
      .maybeSingle();

    if (paymentResult.error) {
      return failure("Unable to look up the store payment.", 500);
    }

    if (!paymentResult.data) {
      const walletResult = await admin
        .from("wallet_topup_requests")
        .select("id, user_id, amount")
        .eq("gateway_order_id", binanceOrder.prepayId)
        .eq("payment_method", "BINANCE_PAY")
        .maybeSingle();

      if (walletResult.error || !walletResult.data) {
        return failure("Matching payment or wallet top-up was not found.");
      }

      const walletCompletion = await admin.rpc(
        "complete_binance_wallet_topup",
        {
          p_request_id: walletResult.data.id,
          p_prepay_id: binanceOrder.prepayId,
          p_transaction_id: binanceOrder.transactionId,
        }
      );

      if (walletCompletion.error) {
        return failure(walletCompletion.error.message, 500);
      }

      const completion = walletCompletion.data as {
        amount?: number;
        balanceAfter?: number;
        alreadyCompleted?: boolean;
      };

      if (!completion.alreadyCompleted) {
        await sendBinanceWalletEmails(
          walletResult.data.user_id,
          Number(completion.amount ?? walletResult.data.amount),
          Number(completion.balanceAfter ?? 0)
        );
      }

      return NextResponse.json({
        returnCode: "SUCCESS",
        returnMessage: null,
      });
    }

    const completionResult = await admin.rpc(
      "complete_binance_payment",
      {
        p_payment_id: paymentResult.data.id,
        p_prepay_id: binanceOrder.prepayId,
        p_transaction_id: binanceOrder.transactionId,
      }
    );

    if (completionResult.error) {
      return failure(completionResult.error.message, 500);
    }

    await prepareOrderForManualFulfillment(
      paymentResult.data.order_id,
    );

    await sendBinanceDeliveryEmails(paymentResult.data.order_id);

    return NextResponse.json({
      returnCode: "SUCCESS",
      returnMessage: null,
    });
  } catch {
    return failure("Unable to process Binance Pay notification.", 500);
  }
}
