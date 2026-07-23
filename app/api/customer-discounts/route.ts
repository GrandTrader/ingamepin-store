import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false, email: null, discounts: {} });
    }

    const admin = createAdminClient();
    const discountResult = await admin
      .from("customer_product_discounts")
      .select("product_id, discount_percent")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (discountResult.error) {
      console.error("Customer discount lookup failed:", discountResult.error);
      return NextResponse.json({ error: "Unable to load customer discounts." }, { status: 500 });
    }

    const discounts = Object.fromEntries(
      (discountResult.data ?? []).map((row) => [
        row.product_id,
        Number(row.discount_percent),
      ]),
    );

    return NextResponse.json({ authenticated: true, email: user.email ?? null, discounts });
  } catch (error) {
    console.error("Customer discount endpoint failed:", error);
    return NextResponse.json({ error: "Unable to load customer discounts." }, { status: 500 });
  }
}
