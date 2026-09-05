import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminCheck = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminCheck.data) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const [ordersResult, affiliateApplicationsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "PROCESSING"),
    admin
      .from("affiliate_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING"),
  ]);

  if (ordersResult.error || affiliateApplicationsResult.error) {
    return NextResponse.json(
      { error: "Unable to load admin notifications." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      count: ordersResult.count ?? 0,
      affiliateApplicationCount: affiliateApplicationsResult.count ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
