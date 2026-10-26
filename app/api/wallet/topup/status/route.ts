import { NextRequest, NextResponse } from "next/server";

import { getUsdtInvoice } from "@/lib/usdt-gateway";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const requestId =
      request.nextUrl.searchParams.get("requestId")?.trim() ?? "";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !requestId) {
      return NextResponse.json({ error: "Access denied." }, { status: 401 });
    }

    const result = await supabase
      .from("wallet_topup_requests")
      .select(
        "id, status, payment_method, gateway_order_id, gateway_transaction_id, financial_hold_at, financial_hold_released_at",
      )
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();
    const topup = result.data;

    if (result.error || !topup || !topup.gateway_order_id) {
      return NextResponse.json(
        { error: "Wallet top-up was not found." },
        { status: 404 },
      );
    }

    if (topup.financial_hold_at && !topup.financial_hold_released_at) {
      return NextResponse.json({ topupStatus: "HELD", transactionId: topup.gateway_transaction_id });
    }

    if (topup.payment_method !== "USDT_DIRECT" || topup.status !== "PENDING") {
      return NextResponse.json({
        topupStatus: topup.status,
        transactionId: topup.gateway_transaction_id,
      });
    }

    const invoice = await getUsdtInvoice(topup.gateway_order_id);
    return NextResponse.json({
      invoice,
      topupStatus: topup.status,
      transactionId: topup.gateway_transaction_id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to check wallet payment.",
      },
      { status: 500 },
    );
  }
}
