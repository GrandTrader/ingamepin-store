import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  signDigiseller,
  verifyDigiseller,
} from "@/lib/digiseller-usdt";
import { createUsdtInvoice, getUsdtInvoice } from "@/lib/usdt-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function money(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2) : null;
}

function networkForPaymentId(paymentId: string) {
  const trc20Id = process.env.DIGISELLER_TRC20_PAYMENT_ID?.trim();
  const bep20Id = process.env.DIGISELLER_BEP20_PAYMENT_ID?.trim();
  if (trc20Id && paymentId === trc20Id) return "TRC20" as const;
  if (bep20Id && paymentId === bep20Id) return "BEP20" as const;
  throw new Error("This Digiseller payment method is not configured.");
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const invoiceId = String(form.get("invoice_id") ?? "").trim();
    const amount = money(String(form.get("amount") ?? ""));
    const currency = String(form.get("currency") ?? "").trim().toUpperCase();
    const paymentId = String(form.get("payment_id") ?? "").trim();
    const returnUrl = String(form.get("return_url") ?? "").trim();
    const signature = String(form.get("signature") ?? "").trim();

    if (!invoiceId || !amount || currency !== "USD" || !paymentId) {
      return NextResponse.json({ error: "Invalid Digiseller payment request." }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid Digiseller signature." }, { status: 401 });
    }
    const network = networkForPaymentId(paymentId);

    const admin = createAdminClient();
    const existingResult = await admin
      .from("digiseller_usdt_payments")
      .select("public_token")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    let publicToken = existingResult.data?.public_token ?? "";
    if (!publicToken) {
      publicToken = randomBytes(32).toString("hex");
      const invoice = await createUsdtInvoice({
        orderId: `digiseller:${invoiceId}`,
        network,
        amount: Number(amount),
        callbackUrl: "https://www.ingamepin.com/api/digiseller/usdt/webhook",
      });
      const insertResult = await admin.from("digiseller_usdt_payments").insert({
        invoice_id: invoiceId,
        gateway_invoice_id: invoice.invoiceId,
        public_token: publicToken,
        amount,
        currency,
        payment_method_id: paymentId,
        network,
        return_url: returnUrl || null,
        status: "wait",
      });
      if (insertResult.error) throw insertResult.error;
    }

    return NextResponse.redirect(
      new URL(
        `/digiseller/usdt/${encodeURIComponent(invoiceId)}?token=${publicToken}`,
        request.url,
      ),
      303,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to initialize payment." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const invoiceId = request.nextUrl.searchParams.get("invoice_id")?.trim() ?? "";
    const sellerId = request.nextUrl.searchParams.get("seller_id")?.trim() ?? "";
    const requestedAmount = money(request.nextUrl.searchParams.get("amount") ?? "");
    const requestedCurrency =
      request.nextUrl.searchParams.get("currency")?.trim().toUpperCase() ?? "";
    const signature = request.nextUrl.searchParams.get("signature")?.trim() ?? "";
    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";

    const admin = createAdminClient();
    const result = await admin
      .from("digiseller_usdt_payments")
      .select("invoice_id, gateway_invoice_id, public_token, amount, currency, status, return_url, network")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (result.error || !result.data) {
      return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
    }
    const payment = result.data;

    if (token) {
      if (token !== payment.public_token) {
        return NextResponse.json({ error: "Payment access denied." }, { status: 403 });
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
      return NextResponse.json({ error: "Invalid status signature." }, { status: 401 });
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
      { error: error instanceof Error ? error.message : "Unable to check payment." },
      { status: 500 },
    );
  }
}