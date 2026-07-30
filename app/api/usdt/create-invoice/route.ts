import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  createUsdtInvoice,
  getUsdtInvoice,
  type UsdtNetwork,
} from "@/lib/usdt-gateway";
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
      network?: unknown;
    };
    const orderId = String(body.orderId ?? "").trim();
    const accessToken = String(body.accessToken ?? "").trim();
    const network = String(body.network ?? "").trim().toUpperCase() as UsdtNetwork;

    if (
      !orderId ||
      accessToken.length < 40 ||
      !["TRC20", "BEP20", "SOLANA"].includes(network)
    ) {
      return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });
    }

    const admin = createAdminClient();
    const orderResult = await admin
      .from("orders")
      .select("id, total, currency, status, access_token_hash")
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

    if (order.status !== "PENDING_PAYMENT" || order.currency !== "USD") {
      return NextResponse.json(
        { error: "This order is not awaiting a USD payment." },
        { status: 400 },
      );
    }

    const paymentResult = await admin
      .from("payments")
      .select("id, method, status, gateway_order_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const payment = paymentResult.data;

    if (
      paymentResult.error ||
      !payment ||
      payment.method !== "USDT_DIRECT" ||
      payment.status !== "PENDING"
    ) {
      return NextResponse.json(
        { error: "This is not a pending direct USDT order." },
        { status: 400 },
      );
    }

    if (payment.gateway_order_id) {
      const existing = await getUsdtInvoice(payment.gateway_order_id);
      if (existing.network !== network) {
        return NextResponse.json(
          { error: `This invoice already uses ${existing.network}.` },
          { status: 409 },
        );
      }
      return NextResponse.json({ invoice: existing });
    }

    const invoice = await createUsdtInvoice({
      orderId: order.id,
      network,
      amount: Number(order.total),
    });
    const updateResult = await admin
      .from("payments")
      .update({ gateway_order_id: invoice.invoiceId })
      .eq("id", payment.id)
      .is("gateway_order_id", null);

    if (updateResult.error) {
      return NextResponse.json(
        { error: "Unable to save the USDT invoice." },
        { status: 500 },
      );
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create the USDT invoice.",
      },
      { status: 500 },
    );
  }
}
