import { NextRequest, NextResponse } from "next/server";

import { BinanceCreateOrderResult, callBinancePay } from "@/lib/binance-pay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { requestId?: unknown };
    const requestId = String(body.requestId ?? "").trim();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }

    const admin = createAdminClient();
    const topupResult = await admin
      .from("wallet_topup_requests")
      .select("id, user_id, amount, currency, payment_method, status, gateway_order_id")
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();
    const topup = topupResult.data;

    if (!topup || topup.payment_method !== "BINANCE_PAY" || topup.status !== "PENDING") {
      return NextResponse.json({ error: "This wallet top-up is unavailable." }, { status: 400 });
    }

    if (topup.gateway_order_id) {
      return NextResponse.json({ error: "A Binance Pay session already exists for this top-up." }, { status: 409 });
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const merchantTradeNo = topup.id.replaceAll("-", "");
    const binanceOrder = await callBinancePay<BinanceCreateOrderResult>(
      "/binancepay/openapi/v3/order",
      {
        env: { terminalType: "WEB" },
        merchantTradeNo,
        fiatAmount: Number(topup.amount),
        fiatCurrency: topup.currency,
        description: "InGamePin wallet top-up",
        goodsDetails: [
          {
            goodsType: "02",
            goodsCategory: "6000",
            referenceGoodsId: merchantTradeNo,
            goodsName: "InGamePin Wallet Top-Up",
          },
        ],
        buyer: { buyerEmail: user.email },
        returnUrl: `${siteUrl}/account/wallet?success=Binance+Pay+payment+received`,
        cancelUrl: `${siteUrl}/account/wallet`,
        orderExpireTime: Date.now() + 30 * 60 * 1000,
        passThroughInfo: `wallet:${topup.id}`,
        webhookUrl: `${siteUrl}/api/binance-pay/webhook`,
      }
    );

    const updateResult = await admin
      .from("wallet_topup_requests")
      .update({ gateway_order_id: binanceOrder.prepayId })
      .eq("id", topup.id)
      .is("gateway_order_id", null);

    if (updateResult.error) {
      return NextResponse.json({ error: "Unable to save the Binance Pay session." }, { status: 500 });
    }

    return NextResponse.json({
      checkoutUrl: binanceOrder.universalUrl || binanceOrder.checkoutUrl,
      expiresAt: binanceOrder.expireTime,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start Binance Pay." },
      { status: 500 }
    );
  }
}
