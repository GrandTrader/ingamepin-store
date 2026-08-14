import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let refreshedCookies: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const pathname = request.nextUrl.pathname;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminLoginPage = pathname.startsWith("/admin/login");
  const hasAuthCookie = hasSupabaseAuthCookie(
    request.cookies.getAll(),
  );

  if (!hasAuthCookie) {
    if (isAdminPage && !isAdminLoginPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        refreshedCookies = cookiesToSet;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  function redirectWithSession(path: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";

    const redirectResponse = NextResponse.redirect(url);
    refreshedCookies.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    return redirectResponse;
  }

  if (isAdminPage && !isAdminLoginPage) {
    if (!user) {
      return redirectWithSession("/admin/login");
    }

    const adminResult = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminResult.error || !adminResult.data) {
      return redirectWithSession("/admin/login");
    }

    const [assuranceResult, factorsResult] =
      await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

    const hasVerifiedFactor =
      !factorsResult.error &&
      factorsResult.data.totp.length > 0;

    if (
      hasVerifiedFactor &&
      (assuranceResult.error ||
        assuranceResult.data.currentLevel !== "aal2")
    ) {
      return redirectWithSession("/admin/login/verify");
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
