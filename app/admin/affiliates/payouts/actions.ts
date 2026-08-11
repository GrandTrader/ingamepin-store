"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function payoutRedirect(kind: "success" | "error", message: string): never {
  redirect(`/admin/affiliates/payouts?${kind}=${encodeURIComponent(message)}`);
}

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const accessResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!accessResult.data) redirect("/admin/login?error=Access denied");

  return user;
}

function readRequestId(formData: FormData) {
  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    payoutRedirect("error", "Payout request information is invalid.");
  }
  return requestId;
}

export async function approveAffiliatePayout(formData: FormData) {
  const administrator = await requireAdministrator();
  const requestId = readRequestId(formData);
  const result = await createAdminClient().rpc(
    "approve_affiliate_payout_request",
    { p_request_id: requestId, p_admin_user_id: administrator.id },
  );

  if (result.error) payoutRedirect("error", result.error.message);

  revalidatePath("/admin/affiliates/payouts");
  payoutRedirect("success", "Affiliate payout approved.");
}

export async function rejectAffiliatePayout(formData: FormData) {
  const administrator = await requireAdministrator();
  const requestId = readRequestId(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  const result = await createAdminClient().rpc(
    "reject_affiliate_payout_request",
    {
      p_request_id: requestId,
      p_admin_user_id: administrator.id,
      p_reason: reason,
    },
  );

  if (result.error) payoutRedirect("error", result.error.message);

  revalidatePath("/admin/affiliates/payouts");
  revalidatePath("/account/affiliate");
  payoutRedirect("success", "Affiliate payout rejected and balance restored.");
}

export async function markAffiliatePayoutPaid(formData: FormData) {
  const administrator = await requireAdministrator();
  const requestId = readRequestId(formData);
  const transactionId = String(formData.get("transaction_id") ?? "").trim();
  const result = await createAdminClient().rpc("mark_affiliate_payout_paid", {
    p_request_id: requestId,
    p_admin_user_id: administrator.id,
    p_transaction_id: transactionId,
  });

  if (result.error) payoutRedirect("error", result.error.message);

  revalidatePath("/admin/affiliates/payouts");
  revalidatePath("/account/affiliate");
  payoutRedirect("success", "Affiliate payout marked as paid.");
}
