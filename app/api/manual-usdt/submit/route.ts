import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isManualUsdtNetwork, isValidManualPaymentReference } from "@/lib/manual-usdt";

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
      transactionHash?: unknown;
      network?: unknown;
    };
    const orderId = String(body.orderId ?? "").trim();
    const accessToken = String(body.accessToken ?? "").trim();
    const transactionHash = String(body.transactionHash ?? "").trim();
    const network = String(body.network ?? "").trim().toUpperCase();

    if (!orderId || accessToken.length < 40 || !isManualUsdtNetwork(network) || !isValidManualPaymentReference(network, transactionHash)) {
      return NextResponse.json(
        { error: "Select a payment option and enter a valid transaction reference." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const orderResult = await admin
      .from("orders")
      .select("id, order_number, customer_email, access_token_hash")
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

    const result = await admin.rpc("submit_manual_payment", {
      p_order_id: order.id,
      p_order_number: order.order_number,
      p_customer_email: order.customer_email,
      p_transaction_id: `${network}:${transactionHash}`,
      p_screenshot_path: "",
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: "PAYMENT_REVIEW" });
  } catch {
    return NextResponse.json(
      { error: "Unable to submit the payment for review." },
      { status: 500 },
    );
  }
}
