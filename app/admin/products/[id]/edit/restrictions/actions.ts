"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function saveProductRestriction(formData: FormData) {
  const id = String(formData.get("id") ?? ""); const path = `/admin/products/${id}/edit/restrictions`;
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); if (!access.data) redirect("/admin/login?error=Access denied");
  const weeklyLimit = Number(formData.get("weekly_limit")); if (!Number.isFinite(weeklyLimit) || weeklyLimit <= 0) redirect(`${path}?error=Enter a valid weekly limit`);
  const admin = createAdminClient();
  const result = await admin.from("product_purchase_restrictions").upsert({ product_id: id, is_enabled: formData.get("is_enabled") === "on", weekly_limit: weeklyLimit, limit_currency: String(formData.get("limit_currency") ?? "INR"), identity_mode: String(formData.get("identity_mode") ?? "ACCOUNT_EMAIL_IP"), reset_mode: String(formData.get("reset_mode") ?? "ROLLING_7_DAYS"), notification_message: String(formData.get("notification_message") ?? "").trim(), updated_at: new Date().toISOString() });
  if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`); revalidatePath(path); redirect(`${path}?success=Restrictions saved`);
}

export async function saveDenominationQuantity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const path = `/admin/products/${id}/edit/restrictions`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
  if (!optionId) redirect(`${path}?error=Select a denomination`);
  const minimum = Number(formData.get("option_minimum_quantity"));
  const maximum = Number(formData.get("option_maximum_quantity"));
  if (!Number.isSafeInteger(minimum) || minimum < 1 || !Number.isSafeInteger(maximum) || maximum < minimum) redirect(`${path}?error=Enter valid denomination quantities`);
  const result = await createAdminClient().from("product_options").update({ minimum_quantity: minimum, maximum_quantity: maximum }).eq("id", optionId).eq("product_id", id);
  if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(path);
  redirect(`${path}?success=Denomination quantity saved`);
}

export async function removeDenominationQuantity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const path = `/admin/products/${id}/edit/restrictions`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
  const result = await createAdminClient().from("product_options").update({ minimum_quantity: null, maximum_quantity: null }).eq("id", optionId).eq("product_id", id);
  if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(path);
  redirect(`${path}?success=Denomination restriction removed`);
}
