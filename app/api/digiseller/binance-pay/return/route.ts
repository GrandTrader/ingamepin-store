import { NextRequest, NextResponse } from "next/server";

import { callBinancePay } from "@/lib/binance-pay";
import { completeDigisellerBinancePayment } from "@/lib/digiseller-binance-pay";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type BinanceOrderQuery = {
  prepayId: string;
  transactionId?: string;
  status: string;
};

function confirmationPending(request: NextRequest, paid: boolean) {
  const attempt = Math.max(0, Math.min(6, Number(request.nextUrl.searchParams.get("attempt")) || 0));
  const retry = new URL(request.url);
  retry.searchParams.set("attempt", String(attempt < 6 ? attempt + 1 : 0));
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const retryUrl = escape(retry.toString());
  const title = paid ? "Payment received" : "Checking your payment";
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">${attempt < 6 ? `<meta http-equiv="refresh" content="10;url=${retryUrl}">` : ""}<title>${title} | iNGamePIN</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f7fb;color:#14263d;font:16px/1.6 system-ui,sans-serif}main{max-width:440px;margin:24px;padding:32px;background:white;border:1px solid #d6e1ec;border-radius:20px}h1{font-size:26px;margin:0 0 12px}p{margin:12px 0}a{display:inline-block;margin-top:12px;padding:12px 20px;background:#007f94;color:white;border-radius:10px;text-decoration:none;font-weight:600}</style></head><body><main><h1>${title}</h1><p>${paid ? "Your payment was received. We are waiting for DigiSeller to confirm your order." : "We could not check the payment status just now. Please try again shortly."}</p><p>Please do not pay again.</p><p>${attempt < 6 ? "This page will check again automatically in 10 seconds." : "Confirmation is taking longer than usual. You can check again using the button below."}</p><a href="${retryUrl}">Check confirmation</a></main></body></html>`, {
    status: 202,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const invoiceId =
      request.nextUrl.searchParams.get("invoice_id")?.trim() ?? "";
    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
    if (!invoiceId || !token) {
      return NextResponse.json(
        { error: "Invalid payment return." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const result = await admin
      .from("digiseller_usdt_payments")
      .select(
        "gateway_invoice_id, public_token, return_url, checkout_url, network, status, transaction_hash, digiseller_notified_at",
      )
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (
      result.error ||
      !result.data ||
      result.data.public_token !== token ||
      result.data.network !== "BINANCE_PAY"
    ) {
      return NextResponse.json(
        { error: "Payment return access was denied." },
        { status: 403 },
      );
    }

    const payment = result.data;
    if (payment.status === "paid") {
      if (!payment.digiseller_notified_at) {
        if (!payment.transaction_hash) return confirmationPending(request, true);
        try {
          const completed = await completeDigisellerBinancePayment(payment.gateway_invoice_id, payment.transaction_hash);
          if (!completed) return confirmationPending(request, true);
        } catch {
          return confirmationPending(request, true);
        }
      }
      return NextResponse.redirect(payment.return_url || "https://digiseller.me/", 303);
    }
    const binanceOrder = await callBinancePay<BinanceOrderQuery>(
      "/binancepay/openapi/v2/order/query",
      { prepayId: payment.gateway_invoice_id },
    );

    if (
      binanceOrder.status === "PAID" &&
      binanceOrder.prepayId === payment.gateway_invoice_id &&
      binanceOrder.transactionId
    ) {
      try {
        const completed = await completeDigisellerBinancePayment(
          binanceOrder.prepayId,
          binanceOrder.transactionId,
        );
        if (!completed) return confirmationPending(request, true);
      } catch {
        return confirmationPending(request, true);
      }
      return NextResponse.redirect(
        payment.return_url || "https://digiseller.me/",
        303,
      );
    }

    return NextResponse.redirect(
      payment.checkout_url || payment.return_url || "https://digiseller.me/",
      303,
    );
  } catch {
    return confirmationPending(request, false);
  }
}
