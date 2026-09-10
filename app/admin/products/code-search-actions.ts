"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function searchInventoryCodes(search: string, page = 1) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw new Error("Sign in as an administrator to search codes.");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) throw new Error("Administrator access is required.");
  const assurance = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || (assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2")) {
    throw new Error("Complete administrator verification before searching codes.");
  }
  if (typeof search !== "string" || !search.trim() || search.length > 500 || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
    throw new Error("Enter a code or part of a voucher (up to 500 characters).");
  }
  const escaped = search.trim().replace(/[\\%_]/g, "\\$&");
  const { data, error, count } = await createAdminClient()
    .from("gift_card_codes")
    .select("id, code, status, denomination, created_at, sold_at, product_id, products(name, public_id), product_options(option_name)", { count: "exact" })
    .ilike("code", "%" + escaped + "%")
    .order("created_at", { ascending: false }).order("id")
    .range((page - 1) * 50, page * 50 - 1);
  if (error) throw new Error("Unable to search inventory. Please try again.");
  return { rows: data ?? [], total: count ?? 0, page };
}
