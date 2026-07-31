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
        "gateway_invoice_id, public_token, return_url, checkout_url, network",
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
    const binanceOrder = await callBinancePay<BinanceOrderQuery>(
      "/binancepay/openapi/v2/order/query",
      { prepayId: payment.gateway_invoice_id },
    );

    if (
      binanceOrder.status === "PAID" &&
      binanceOrder.prepayId === payment.gateway_invoice_id &&
      binanceOrder.transactionId
    ) {
      await completeDigisellerBinancePayment(
        binanceOrder.prepayId,
        binanceOrder.transactionId,
      );
      return NextResponse.redirect(
        payment.return_url || "https://digiseller.me/",
        303,
      );
    }

    return NextResponse.redirect(
      payment.checkout_url || payment.return_url || "https://digiseller.me/",
      303,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete Binance Pay return.",
      },
      { status: 500 },
    );
  }
}
