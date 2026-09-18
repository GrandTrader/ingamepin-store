import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  let refreshedCookies: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        refreshedCookies = cookiesToSet;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAdminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/") || isAdminApi;
  const isAdminLoginPage = pathname.startsWith("/admin/login");

  function redirectWithSession(path: string) {
    if (isAdminApi) return NextResponse.json({ error: "Administrator authentication and two-factor verification are required." }, { status: user ? 403 : 401, headers: { "Cache-Control": "no-store" } });
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

    const [adminResult, hasAssurance] = await Promise.all([supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(), hasRequiredAdminAssurance(supabase)]);

    if (adminResult.error || !adminResult.data) {
      return redirectWithSession("/admin/login");
    }

    if (!hasAssurance) {
      return redirectWithSession("/admin/login/verify");
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
