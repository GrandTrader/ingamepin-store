import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeKassaReturnCookie } from "@/lib/freekassa-return";

function redirect(url: URL | string) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function redirectToSuccess(request: NextRequest, orderId: string) {
  if (orderId.startsWith("DS-")) {
    const invoiceId = orderId.slice(3);
    const token = request.cookies.get(freeKassaReturnCookie(invoiceId))?.value ?? "";
    // Invoice numbers are public identifiers, never proof of payment ownership.
    if (/^[0-9a-f]{64}$/.test(token)) {
      const result = await createAdminClient()
        .from("digiseller_usdt_payments")
        .select("return_url")
        .eq("invoice_id", invoiceId)
        .eq("network", "FREEKASSA_FPS")
        .eq("public_token", token)
        .maybeSingle();
      if (!result.error && result.data?.return_url) {
        const url = new URL(result.data.return_url);
        if (url.protocol === "https:" && !url.username && !url.password &&
            (!url.port || url.port === "443") &&
            ["digiseller.me", "www.digiseller.me", "oplata.info", "www.oplata.info"].includes(url.hostname)) {
          return redirect(url);
        }
      }
    }
    // Old or another browser's return cannot disclose a private purchase link.
    return redirect("https://oplata.info/");
  }

  if (/^[0-9a-f-]{36}$/i.test(orderId)) {
    const result = await createAdminClient()
      .from("wallet_topup_requests")
      .select("id,return_to_business")
      .eq("id", orderId)
      .eq("payment_method", "FREEKASSA")
      .maybeSingle();
    if (result.data) {
      return redirect(new URL(
        `${result.data.return_to_business ? "/account/portal/wallet" : "/account/wallet"}/topup-return?requestId=${encodeURIComponent(orderId)}`,
        request.url,
      ));
    }
  }
  return redirect(new URL("/checkout/success", request.url));
}

export async function GET(request: NextRequest) {
  const orderId = (request.nextUrl.searchParams.get("MERCHANT_ORDER_ID") ??
    request.nextUrl.searchParams.get("o") ?? "").trim();
  return redirectToSuccess(request, orderId.slice(0, 128));
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const orderId = String(form.get("MERCHANT_ORDER_ID") ?? form.get("o") ?? "").trim().slice(0, 128);
  // Convert cross-site POST returns to top-level GET so SameSite=Lax cookies
  // are available. This step never reads or reveals a saved private link.
  const url = new URL("/api/freekassa/success", request.url);
  url.searchParams.set("o", orderId);
  return redirect(url);
}
