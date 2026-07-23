import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  BinanceCreateOrderResult,
  callBinancePay,
} from "@/lib/binance-pay";
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
      .select("id, order_number, customer_email, total, status, access_token_hash")
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

    if (order.status !== "PENDING_PAYMENT") {
      return NextResponse.json({ error: "This order is not awaiting payment." }, { status: 400 });
    }

    const paymentResult = await admin
      .from("payments")
      .select("id, method, status, gateway_order_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const payment = paymentResult.data;

    if (!payment || payment.method !== "BINANCE_PAY" || payment.status !== "PENDING") {
      return NextResponse.json({ error: "This is not a pending Binance Pay order." }, { status: 400 });
    }

    if (payment.gateway_order_id) {
      return NextResponse.json({ error: "A Binance Pay checkout already exists for this order." }, { status: 409 });
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const webhookUrl = process.env.BINANCE_PAY_WEBHOOK_URL;
    const merchantTradeNo = order.id.replaceAll("-", "");
    const binanceOrder = await callBinancePay<BinanceCreateOrderResult>(
      "/binancepay/openapi/v3/order",
      {
        env: { terminalType: "WEB" },
        merchantTradeNo,
        fiatAmount: Number(order.total),
        fiatCurrency: "INR",
        description: `InGamePin order ${order.order_number}`,
        goodsDetails: [
          {
            goodsType: "02",
            goodsCategory: "6000",
            referenceGoodsId: merchantTradeNo,
            goodsName: "InGamePin Digital Gaming Products",
          },
        ],
        buyer: { buyerEmail: order.customer_email },
        returnUrl: `${siteUrl}/checkout/success`,
        cancelUrl: `${siteUrl}/checkout/payment`,
        orderExpireTime: Date.now() + 30 * 60 * 1000,
        passThroughInfo: order.id,
        ...(webhookUrl && !/localhost|your-domain|example/i.test(webhookUrl)
          ? { webhookUrl }
          : {}),
      }
    );

    const updateResult = await admin
      .from("payments")
      .update({ gateway_order_id: binanceOrder.prepayId })
      .eq("id", payment.id)
      .is("gateway_order_id", null);

    if (updateResult.error) {
      return NextResponse.json({ error: "Unable to save the Binance payment session." }, { status: 500 });
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
