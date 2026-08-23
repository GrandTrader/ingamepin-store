import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { notifyDigiseller } from "@/lib/digiseller-usdt";
import { getUsdtInvoice, type UsdtInvoice } from "@/lib/usdt-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validGatewaySignature(rawBody: string, timestamp: string, signature: string) {
  const secret = process.env.USDT_GATEWAY_CALLBACK_SECRET;
  if (!secret || !timestamp || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 300) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const actual = Buffer.from(signature.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (
      !validGatewaySignature(
        rawBody,
        request.headers.get("x-gateway-timestamp") ?? "",
        request.headers.get("x-gateway-signature") ?? "",
      )
    ) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as UsdtInvoice;
    if (body.status === "COMPLIANCE_HOLD") {
      const verified = await getUsdtInvoice(body.invoiceId);
      if (
        verified.status !== "COMPLIANCE_HOLD" ||
        verified.transactionHash !== body.transactionHash
      ) {
        return NextResponse.json({ error: "Compliance hold verification failed." }, { status: 400 });
      }
      const admin = createAdminClient();
      await admin
        .from("digiseller_usdt_payments")
        .update({
          status: "payment_review",
          transaction_hash: body.transactionHash,
          updated_at: new Date().toISOString(),
        })
        .eq("gateway_invoice_id", body.invoiceId);
      return NextResponse.json({ received: true, held: true });
    }
    if (body.status !== "PAID") return NextResponse.json({ received: true });
    const verified = await getUsdtInvoice(body.invoiceId);
    if (
      verified.status !== "PAID" ||
      verified.orderId !== body.orderId ||
      verified.transactionHash !== body.transactionHash ||
      verified.amount !== body.amount ||
      verified.network !== body.network
    ) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }

    const admin = createAdminClient();
    const paymentResult = await admin
      .from("digiseller_usdt_payments")
      .select("invoice_id, amount, currency, status, network, digiseller_notified_at")
      .eq("gateway_invoice_id", body.invoiceId)
      .maybeSingle();
    if (paymentResult.error || !paymentResult.data) {
      return NextResponse.json({ error: "Digiseller payment was not found." }, { status: 404 });
    }
    const payment = paymentResult.data;
    if (body.network !== payment.network) {
      return NextResponse.json({ error: "Payment network mismatch." }, { status: 400 });
    }

    if (payment.status !== "paid") {
      const updateResult = await admin
        .from("digiseller_usdt_payments")
        .update({
          status: "paid",
          transaction_hash: body.transactionHash,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("invoice_id", payment.invoice_id)
        .neq("status", "paid");
      if (updateResult.error) throw updateResult.error;

    }

    if (!payment.digiseller_notified_at) {
      await notifyDigiseller({
        invoiceId: payment.invoice_id,
        amount: Number(payment.amount).toFixed(2),
        currency: payment.currency,
        status: "paid",
      });

      const notificationResult = await admin
        .from("digiseller_usdt_payments")
        .update({
          digiseller_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("invoice_id", payment.invoice_id)
        .is("digiseller_notified_at", null);
      if (notificationResult.error) throw notificationResult.error;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process payment." },
      { status: 500 },
    );
  }
}
