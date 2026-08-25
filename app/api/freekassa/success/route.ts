import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function redirectToSuccess(request: NextRequest, orderId: string) {
  if (orderId) {
    const admin = createAdminClient();

    if (orderId.startsWith("DS-")) {
      const invoiceId = orderId.slice(3);
      const digisellerResult = await admin
        .from("digiseller_usdt_payments")
        .select("return_url")
        .eq("invoice_id", invoiceId)
        .eq("network", "FREEKASSA_FPS")
        .maybeSingle();

      if (digisellerResult.data?.return_url) {
        return NextResponse.redirect(digisellerResult.data.return_url, 303);
      }
    }

    const result = await admin
      .from("wallet_topup_requests")
      .select("id")
      .eq("id", orderId)
      .eq("payment_method", "FREEKASSA")
      .maybeSingle();
    if (result.data) {
      return NextResponse.redirect(
        new URL(`/account/wallet/topup-return?requestId=${encodeURIComponent(orderId)}`, request.url),
        303,
      );
    }
  }
  return NextResponse.redirect(new URL("/checkout/success", request.url), 303);
}

export async function GET(request: NextRequest) {
  const orderId =
    request.nextUrl.searchParams.get("MERCHANT_ORDER_ID") ??
    request.nextUrl.searchParams.get("o") ??
    "";
  return redirectToSuccess(request, orderId.trim());
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const orderId = String(
    form.get("MERCHANT_ORDER_ID") ?? form.get("o") ?? "",
  ).trim();
  return redirectToSuccess(request, orderId);
}
