import { NextRequest, NextResponse } from "next/server";

import {
  BinanceCreateOrderResult,
  callBinancePay,
} from "@/lib/binance-pay";
import { createFreeKassaCheckoutUrl } from "@/lib/freekassa";
import { createPallyBill, getUsdRubRate } from "@/lib/pally";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createUsdtInvoice, type UsdtNetwork } from "@/lib/usdt-gateway";
import {
  getWalletPaymentGateways,
  isWalletGatewayId,
} from "@/lib/wallet-payment-gateways";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      amount?: unknown;
      gateway?: unknown;
      network?: unknown;
    };
    const amount = Number(body.amount);
    const gateway = String(body.gateway ?? "").trim().toUpperCase();
    const network = String(body.network ?? "")
      .trim()
      .toUpperCase() as UsdtNetwork;

    if (
      !Number.isFinite(amount) ||
      amount < 10 ||
      amount > 10000 ||
      !isWalletGatewayId(gateway)
    ) {
      return NextResponse.json(
        { error: "Enter an amount between USD 10 and USD 10,000." },
        { status: 400 },
      );
    }

    if (
      !getWalletPaymentGateways().some((item) => item.id === gateway)
    ) {
      return NextResponse.json(
        { error: "This wallet payment gateway is unavailable." },
        { status: 400 },
      );
    }

    if (
      gateway === "USDT_DIRECT" &&
      !["TRC20", "BEP20", "SOLANA"].includes(network)
    ) {
      return NextResponse.json(
        { error: "Select a supported USDT network." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json(
        { error: "Please sign in to continue." },
        { status: 401 },
      );
    }

    const pending = await supabase
      .from("wallet_topup_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "PENDING")
      .limit(1);

    if (pending.data?.length) {
      return NextResponse.json(
        {
          error:
            "Complete or wait for your pending wallet top-up before starting another.",
        },
        { status: 409 },
      );
    }

    const reference = `${gateway}-${crypto.randomUUID()}`;
    const createResult = await supabase.rpc("create_wallet_topup_request", {
      p_amount: Number(amount.toFixed(2)),
      p_payment_method: gateway,
      p_payment_reference: reference,
    });

    if (createResult.error || !createResult.data) {
      return NextResponse.json(
        {
          error:
            createResult.error?.message ??
            "Unable to create the wallet top-up.",
        },
        { status: 400 },
      );
    }

    const requestId = String(createResult.data);
    const admin = createAdminClient();
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    ).replace(/\/$/, "");
    let checkoutUrl = "";
    let gatewayOrderId = "";
    let gatewayPaymentId: string | null = null;

    if (gateway === "BINANCE_PAY") {
      const merchantTradeNo = requestId.replaceAll("-", "");
      const result = await callBinancePay<BinanceCreateOrderResult>(
        "/binancepay/openapi/v3/order",
        {
          env: { terminalType: "WEB" },
          merchantTradeNo,
          fiatAmount: Number(amount.toFixed(2)),
          fiatCurrency: "USD",
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
          returnUrl: `${siteUrl}/account/wallet?success=Payment+received`,
          cancelUrl: `${siteUrl}/account/wallet`,
          orderExpireTime: Date.now() + 30 * 60 * 1000,
          passThroughInfo: `wallet:${requestId}`,
          webhookUrl: `${siteUrl}/api/binance-pay/webhook`,
        },
      );
      checkoutUrl = result.universalUrl || result.checkoutUrl;
      gatewayOrderId = result.prepayId;
    } else if (gateway === "FREEKASSA") {
      const rate = await getUsdRubRate();
      const rubAmount = (amount * rate).toFixed(2);
      checkoutUrl = createFreeKassaCheckoutUrl({
        amount: rubAmount,
        currency: "RUB",
        orderId: requestId,
        email: user.email,
        language: "en",
      });
      gatewayOrderId = requestId;
      gatewayPaymentId = rubAmount;
    } else if (gateway === "PALLY") {
      const rate = await getUsdRubRate();
      const rubAmount = Number((amount * rate).toFixed(2));
      const bill = await createPallyBill({
        amount: rubAmount,
        currency: "RUB",
        orderId: requestId,
        name: "InGamePin Wallet Top-Up",
        description: "InGamePin Wallet Top-Up",
        payerEmail: user.email,
        items: [
          {
            name: "InGamePin Wallet Top-Up",
            price: rubAmount.toFixed(2),
            category: "digital/wallet/topup",
            quantity: "1",
            extra: { account: user.email },
          },
        ],
      });
      checkoutUrl = bill.checkoutUrl;
      gatewayOrderId = bill.billId;
      gatewayPaymentId = rubAmount.toFixed(2);
    } else {
      const invoice = await createUsdtInvoice({
        orderId: requestId,
        network,
        amount,
      });
      gatewayOrderId = invoice.invoiceId;
      gatewayPaymentId = invoice.amount;
      checkoutUrl = `${siteUrl}/account/wallet/usdt/${requestId}`;
    }

    if (!checkoutUrl || !gatewayOrderId) {
      throw new Error("The payment gateway did not create a payment session.");
    }

    const update = await admin
      .from("wallet_topup_requests")
      .update({
        gateway_order_id: gatewayOrderId,
        payment_reference: gatewayPaymentId ?? reference,
      })
      .eq("id", requestId)
      .eq("user_id", user.id)
      .eq("status", "PENDING")
      .select("id")
      .single();

    if (update.error) {
      throw new Error("Unable to save the wallet payment session.");
    }

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start wallet top-up.",
      },
      { status: 500 },
    );
  }
}
