"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";

export type PurchaseAccessResult = { error?: string; success?: string };
export async function saveCustomerPurchaseAccess(_previous: PurchaseAccessResult, form: FormData): Promise<PurchaseAccessResult> {
  const session = await createClient({ reuseVerifiedUser: true });
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { error: "Sign in as an administrator." };
  const membership = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (membership.error || !membership.data || !await hasRequiredAdminAssurance(session))
    return { error: "Administrator access and verified two-step sign-in are required." };
  const customerId = String(form.get("customer_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const action = form.get("action");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(customerId) || !["restrict", "allow"].includes(String(action)) || !reason || reason.length > 1000)
    return { error: "Choose a customer and enter an internal reason (up to 1000 characters)." };
  const result = await createAdminClient().rpc("set_customer_purchase_restriction", {
    p_admin: user.id, p_customer: customerId, p_enabled: action === "restrict",
    p_devices: form.get("devices") === "on", p_ips: form.get("ips") === "on", p_reason: reason,
  });
  if (result.error) return { error: result.error.code === "P0001" ? result.error.message : "Unable to save financial access. Please try again." };
  revalidatePath(`/admin/customers/${customerId}`);
  return { success: action === "restrict" ? "Financial transactions restricted. Previous orders, history and support remain accessible." : "Financial restriction removed. Separately disabled wallets and held payments still require review." };
}
