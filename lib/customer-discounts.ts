import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { createClient } from "@/lib/supabase/server";

export async function getSignedInCustomerDiscounts() {
  const cookieStore = await cookies();

  if (!hasSupabaseAuthCookie(cookieStore.getAll())) {
    return new Map<string, number>();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return new Map<string, number>();

  const admin = createAdminClient();
  const result = await admin
    .from("customer_product_discounts")
    .select("product_id, discount_percent")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (result.error) {
    console.error("Unable to load signed-in customer discounts:", result.error);
    return new Map<string, number>();
  }

  return new Map(
    (result.data ?? []).map((row) => [row.product_id, Number(row.discount_percent)]),
  );
}
