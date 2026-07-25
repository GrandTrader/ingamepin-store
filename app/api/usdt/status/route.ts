import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getUsdtInvoice } from "@/lib/usdt-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validToken(token: string, storedHash: string) {
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get("orderId")?.trim() ?? "";
    const accessToken =
      request.nextUrl.searchParams.get("accessToken")?.trim() ?? "";

    if (!orderId || accessToken.length < 40) {
      return NextResponse.json({ error: "Invalid order access." }, { status: 400 });
    }

    const admin = createAdminClient();
    const orderResult = await admin
      .from("orders")
      .select("id, status, access_token_hash")
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

    const paymentResult = await admin
      .from("payments")
      .select("method, status, gateway_order_id, transaction_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const payment = paymentResult.data;

    if (
      paymentResult.error ||
      !payment ||
      payment.method !== "USDT_DIRECT" ||
      !payment.gateway_order_id
    ) {
      return NextResponse.json({ error: "USDT invoice was not found." }, { status: 404 });
    }

    const invoice = await getUsdtInvoice(payment.gateway_order_id);
    return NextResponse.json({
      invoice,
      orderStatus: order.status,
      paymentStatus: payment.status,
      transactionId: payment.transaction_id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to check the USDT payment.",
      },
      { status: 500 },
    );
  }
}
