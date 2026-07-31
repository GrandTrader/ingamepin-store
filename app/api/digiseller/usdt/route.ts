import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  signDigiseller,
  verifyDigiseller,
} from "@/lib/digiseller-usdt";
import {
  convertDigisellerAmountToUsd,
  isSupportedDigisellerCurrency,
} from "@/lib/digiseller-currency";
import {
  BinanceCreateOrderResult,
  callBinancePay,
} from "@/lib/binance-pay";
import { createUsdtInvoice, getUsdtInvoice } from "@/lib/usdt-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function money(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2) : null;
}

const DIGISELLER_RETURN_HOSTS = new Set([
  "digiseller.me",
  "www.digiseller.me",
  "oplata.info",
  "www.oplata.info",
]);

function normalizeReturnUrl(value: string) {
  if (!value) return "";

  let decoded = value.trim();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return "";
    }
  }

  try {
    const url = new URL(decoded);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !DIGISELLER_RETURN_HOSTS.has(hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

type DigisellerPaymentKind =
  | "TRC20"
  | "BEP20"
  | "SOLANA"
  | "BINANCE_PAY";

function paymentKindForPaymentId(paymentId: string): DigisellerPaymentKind {
  const trc20Id = process.env.DIGISELLER_TRC20_PAYMENT_ID?.trim();
  const bep20Id = process.env.DIGISELLER_BEP20_PAYMENT_ID?.trim();
  const solanaId = process.env.DIGISELLER_SOLANA_PAYMENT_ID?.trim();
  const binancePayId =
    process.env.DIGISELLER_BINANCE_PAY_PAYMENT_ID?.trim();

  if (trc20Id && paymentId === trc20Id) return "TRC20";
  if (bep20Id && paymentId === bep20Id) return "BEP20";
  if (solanaId && paymentId === solanaId) return "SOLANA";
  if (binancePayId && paymentId === binancePayId) return "BINANCE_PAY";

  throw new Error(
    `Digiseller payment ID ${paymentId || "(empty)"} is not configured. ` +
      `Loaded IDs: TRC20=${trc20Id ? "yes" : "no"}, ` +
      `BEP20=${bep20Id ? "yes" : "no"}, ` +
      `SOLANA=${solanaId ? "yes" : "no"}, ` +
      `BINANCE_PAY=${binancePayId ? "yes" : "no"}.`,
  );
}

export async function POST(request: NextRequest) {
  try {
    const form = new URLSearchParams(await request.text());
    const invoiceId = String(form.get("invoice_id") ?? "").trim();
    const amount = money(String(form.get("amount") ?? ""));
    const currency = String(form.get("currency") ?? "").trim().toUpperCase();
    const paymentId = String(form.get("payment_id") ?? "").trim();
    const returnUrl = normalizeReturnUrl(String(form.get("return_url") ?? "").trim());
    const signature = String(form.get("signature") ?? "").trim();
    const isValidationTest =
      String(form.get("test") ?? "").trim() === "1" ||
      request.headers.get("user-agent") === "http_requester/0.1";

    if (
      (!invoiceId || !amount || !currency || !paymentId) &&
      request.headers.get("user-agent") === "http_requester/0.1"
    ) {
      return NextResponse.json({
        success: true,
        test: true,
      });
    }

    if (!invoiceId || !amount || !currency || !paymentId) {
      return NextResponse.json(
        { error: "Invalid Digiseller payment request." },
        { status: 400 },
      );
    }
    if (
      !verifyDigiseller(
        {
          invoice_id: invoiceId,
          amount,
          currency,
          payment_id: paymentId,
        },
        signature,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid Digiseller signature." },
        { status: 401 },
      );
    }

    // Digiseller validates URLs with a signed fake order and test=1.
    // Confirm the signed request without creating a gateway invoice or DB row.
    if (isValidationTest) {
      return NextResponse.json({
        success: true,
        test: true,
        invoice_id: invoiceId,
      });
    }

    if (!isSupportedDigisellerCurrency(currency)) {
      return NextResponse.json(
        { error: "This payment method accepts USD, RUB, and EUR only." },
        { status: 400 },
      );
    }

    const paymentKind = paymentKindForPaymentId(paymentId);
    const admin = createAdminClient();
    const existingResult = await admin
      .from("digiseller_usdt_payments")
      .select("public_token, network, checkout_url")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    if (
      existingResult.data &&
      existingResult.data.network !== paymentKind
    ) {
      return NextResponse.json(
        { error: "This invoice already uses a different payment method." },
        { status: 409 },
      );
    }

    let publicToken = existingResult.data?.public_token ?? "";

    if (paymentKind === "BINANCE_PAY") {
      if (existingResult.data?.checkout_url) {
        return NextResponse.redirect(existingResult.data.checkout_url, 303);
      }

      const conversion = await convertDigisellerAmountToUsd(amount, currency);
      publicToken = randomBytes(32).toString("hex");
      const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL || "https://www.ingamepin.com"
      ).replace(/\/$/, "");
      const merchantTradeNo = `DS${invoiceId}`
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 32);
      const webhookUrl = process.env.BINANCE_PAY_WEBHOOK_URL;
      const internalReturnUrl = new URL(
        "/api/digiseller/binance-pay/return",
        siteUrl,
      );
      internalReturnUrl.searchParams.set("invoice_id", invoiceId);
      internalReturnUrl.searchParams.set("token", publicToken);

      const binanceOrder = await callBinancePay<BinanceCreateOrderResult>(
        "/binancepay/openapi/v3/order",
        {
          env: { terminalType: "WEB" },
          merchantTradeNo,
          fiatAmount: conversion.usdAmount,
          fiatCurrency: "USD",
          description: `Digiseller invoice ${invoiceId}`,
          goodsDetails: [
            {
              goodsType: "02",
              goodsCategory: "6000",
              referenceGoodsId: invoiceId,
              goodsName: "InGamePin Digital Product",
            },
          ],
          returnUrl: internalReturnUrl.toString(),
          cancelUrl: returnUrl || "https://digiseller.me/",
          orderExpireTime: Date.now() + 30 * 60 * 1000,
          passThroughInfo: `digiseller:${invoiceId}`,
          ...(webhookUrl && !/localhost|your-domain|example/i.test(webhookUrl)
            ? { webhookUrl }
            : {}),
        },
      );
      const checkoutUrl =
        binanceOrder.universalUrl || binanceOrder.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error("Binance Pay did not return a checkout URL.");
      }

      const insertResult = await admin.from("digiseller_usdt_payments").insert({
        invoice_id: invoiceId,
        gateway_invoice_id: binanceOrder.prepayId,
        public_token: publicToken,
        amount,
        currency,
        gateway_amount: conversion.usdAmount.toFixed(2),
        gateway_currency: "USD",
        exchange_rate: conversion.originalUnitsPerUsd,
        payment_method_id: paymentId,
        network: paymentKind,
        return_url: returnUrl || null,
        checkout_url: checkoutUrl,
        status: "wait",
      });
      if (insertResult.error) throw insertResult.error;

      return NextResponse.redirect(checkoutUrl, 303);
    }

    if (!publicToken) {
      const conversion = await convertDigisellerAmountToUsd(amount, currency);
      publicToken = randomBytes(32).toString("hex");
      const invoice = await createUsdtInvoice({
        orderId: `digiseller:${invoiceId}`,
        network: paymentKind,
        amount: conversion.usdAmount,
        callbackUrl: "https://www.ingamepin.com/api/digiseller/usdt/webhook",
      });
      const insertResult = await admin.from("digiseller_usdt_payments").insert({
        invoice_id: invoiceId,
        gateway_invoice_id: invoice.invoiceId,
        public_token: publicToken,
        amount,
        currency,
        gateway_amount: conversion.usdAmount.toFixed(2),
        gateway_currency: "USD",
        exchange_rate: conversion.originalUnitsPerUsd,
        payment_method_id: paymentId,
        network: paymentKind,
        return_url: returnUrl || null,
        status: "wait",
      });
      if (insertResult.error) throw insertResult.error;
    }

    return NextResponse.redirect(
      new URL(
        `/digiseller/usdt/${encodeURIComponent(invoiceId)}?token=${publicToken}`,
        "https://www.ingamepin.com",
      ),
      303,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to initialize payment.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const invoiceId = request.nextUrl.searchParams.get("invoice_id")?.trim() ?? "";
    const sellerId = request.nextUrl.searchParams.get("seller_id")?.trim() ?? "";
    const requestedAmount = money(
      request.nextUrl.searchParams.get("amount") ?? "",
    );
    const requestedCurrency =
      request.nextUrl.searchParams.get("currency")?.trim().toUpperCase() ?? "";
    const signature = request.nextUrl.searchParams.get("signature")?.trim() ?? "";
    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
    const isValidationTest =
      request.nextUrl.searchParams.get("test")?.trim() === "1";

    if (isValidationTest) {
      if (
        !invoiceId ||
        !sellerId ||
        !requestedAmount ||
        !requestedCurrency ||
        !verifyDigiseller(
          {
            invoice_id: invoiceId,
            amount: requestedAmount,
            currency: requestedCurrency,
            seller_id: sellerId,
          },
          signature,
        )
      ) {
        return NextResponse.json(
          { error: "Invalid status signature." },
          { status: 401 },
        );
      }

      const testResponse = {
        invoice_id: invoiceId,
        amount: requestedAmount,
        currency: requestedCurrency,
        status: "wait",
      };
      return NextResponse.json({
        ...testResponse,
        signature: signDigiseller(testResponse),
        error: "",
        integrator: "InGamePin Direct USDT",
      });
    }

    const admin = createAdminClient();
    const result = await admin
      .from("digiseller_usdt_payments")
      .select(
        "invoice_id, gateway_invoice_id, public_token, amount, currency, status, return_url, network",
      )
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (result.error || !result.data) {
      return NextResponse.json(
        { error: "Payment was not found." },
        { status: 404 },
      );
    }
    const payment = result.data;

    if (token) {
      if (token !== payment.public_token) {
        return NextResponse.json(
          { error: "Payment access denied." },
          { status: 403 },
        );
      }
      const invoice = await getUsdtInvoice(payment.gateway_invoice_id);
      return NextResponse.json({
        invoice,
        returnUrl: payment.return_url,
      });
    }

    if (
      !sellerId ||
      !requestedAmount ||
      requestedAmount !== Number(payment.amount).toFixed(2) ||
      requestedCurrency !== payment.currency ||
      !verifyDigiseller(
        {
          invoice_id: invoiceId,
          amount: requestedAmount,
          currency: requestedCurrency,
          seller_id: sellerId,
        },
        signature,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid status signature." },
        { status: 401 },
      );
    }

    const responseValues = {
      invoice_id: invoiceId,
      amount: Number(payment.amount).toFixed(2),
      currency: payment.currency,
      status: payment.status,
    };
    return NextResponse.json({
      ...responseValues,
      signature: signDigiseller(responseValues),
      error: "",
      integrator: "InGamePin Direct USDT",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to check payment.",
      },
      { status: 500 },
    );
  }
}





