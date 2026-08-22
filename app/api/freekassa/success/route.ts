import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function redirectToSuccess(request: NextRequest, orderId: string) {
  if (orderId) {
    const result = await createAdminClient()
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
