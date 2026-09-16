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
  const [ordersResult, affiliateApplicationsResult, trashResult, ...statusResults] = await Promise.all([
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "PROCESSING"),
    admin
      .from("affiliate_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING"),
    // Read the error body so databases awaiting the Trash migration can still report counts.
    admin.from("orders").select("id", { count: "exact" }).eq("status", "TRASHED").limit(0),
    ...["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "DELIVERED"].map((status) =>
      admin.from("orders").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  ]);

  const trashStatusUnavailable = trashResult.error?.code === "22P02" &&
    trashResult.error.message.includes('invalid input value for enum order_status: "TRASHED"');

  if ((trashResult.error && !trashStatusUnavailable) || ordersResult.error || affiliateApplicationsResult.error || statusResults.some((result) => result.error)) {
    return NextResponse.json(
      { error: "Unable to load admin notifications." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      count: ordersResult.count ?? 0,
      orderStatusCounts: {
        pending: statusResults[0].count ?? 0,
        review: statusResults[1].count ?? 0,
        processing: (ordersResult.count ?? 0) + (statusResults[2].count ?? 0),
        completed: statusResults[3].count ?? 0,
        trash: trashResult.count ?? 0,
      },
      affiliateApplicationCount: affiliateApplicationsResult.count ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
