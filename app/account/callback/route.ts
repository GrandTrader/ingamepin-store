import { NextRequest, NextResponse } from "next/server";

import {
  getCountryCode,
  recordCustomerLogin,
} from "@/lib/customer-login-activity";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/account/")
    ? requestedNext
    : "/account/dashboard";

  if (code) {
    const supabase = await createClient();
    const result = await supabase.auth.exchangeCodeForSession(code);
    if (!result.error) {
      if (result.data.user) {
        await recordCustomerLogin(
          result.data.user.id,
          getCountryCode(request.headers),
        );
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/account?error=Email link is invalid or expired.", request.url),
  );
}
