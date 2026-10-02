import type { SupabaseClient } from "@supabase/supabase-js";

// Never use the email entered at checkout to grant an exemption.
export async function exemptPurchaseProducts(
  admin: SupabaseClient,
  authenticatedUserId: string | null | undefined,
  productIds: string[],
): Promise<Set<string>> {
  if (!authenticatedUserId || !productIds.length) return new Set();
  const result = await admin.from("product_purchase_restriction_exemptions")
    .select("product_id").eq("user_id", authenticatedUserId).in("product_id", productIds);
  if (result.error?.code === "PGRST205" || result.error?.code === "42P01") return new Set(); // Before the additive migration, no exemptions exist.
  if (result.error) throw new Error("Unable to verify customer purchase restrictions. Please retry.");
  return new Set((result.data ?? []).map(row => String(row.product_id)));
}
