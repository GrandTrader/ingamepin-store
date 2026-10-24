"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReceiptId } from "@/lib/wallet-receipt";

async function administrator() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/admin/login");
  const result = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (result.error || !result.data) redirect("/admin/login?error=Access denied");
  return user;
}
function finish(path: string, kind: string, message: string): never {
  redirect(path + "?" + new URLSearchParams({ [kind]: message }));
}
function refresh() {
  for (const path of ["/admin/wallet/withdrawals", "/admin/wallet/activity", "/account/wallet", "/account/portal/wallet", "/account/dashboard"]) revalidatePath(path);
}
export async function setWithdrawalAccess(form: FormData) {
  const admin = await administrator();
  const customerId = String(form.get("customer_id") ?? "");
  const enabled = String(form.get("enabled") ?? "");
  if (!isReceiptId(customerId) || !["true", "false"].includes(enabled)) finish("/admin/customers", "error", "Invalid customer.");
  const result = await createAdminClient().rpc("set_wallet_withdrawal_access", { p_user_id: customerId, p_enabled: enabled === "true", p_admin_user_id: admin.id });
  const path = "/admin/customers/" + customerId;
  if (result.error) finish(path, "error", result.error.message);
  revalidatePath(path);
  refresh();
  finish(path, "success", enabled === "true" ? "Crypto withdrawal requests enabled for this customer." : "New withdrawal requests disabled. Existing requests are unchanged.");
}
export async function reviewWithdrawal(form: FormData) {
  const admin = await administrator();
  const id = String(form.get("request_id") ?? "");
  const action = String(form.get("action") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const path = "/admin/wallet/withdrawals";
  if (!isReceiptId(id) || !["APPROVE", "REJECT", "PAY"].includes(action) || form.get("confirmed") !== "yes") finish(path, "error", "Confirm the withdrawal action before continuing.");
  const result = await createAdminClient().rpc("review_wallet_withdrawal", { p_request_id: id, p_admin_user_id: admin.id, p_action: action, p_note: note });
  if (result.error) finish(path, "error", result.error.code === "23505" ? "This transaction hash is already recorded for another withdrawal." : result.error.message);
  refresh();
  finish(path, "success", action === "APPROVE" ? "Approved and assigned to you for manual payout. No crypto has been sent." : action === "REJECT" ? "Withdrawal rejected. The full amount was released." : "Manual payout recorded. No additional wallet deduction was made.");
}
