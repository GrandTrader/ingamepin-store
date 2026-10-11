import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireBusinessBankTransfer(userId: string) {
  const result = await createAdminClient().from("business_kyb")
    .select("status,bank_transfer_enabled").eq("user_id", userId).maybeSingle();
  if (result.error) throw Error("Unable to check Direct Bank Transfer access. Please try again.");
  if (result.data?.status !== "APPROVED") throw Error("Approved business verification is required.");
  if (result.data.bank_transfer_enabled !== true) throw Error("Direct Bank Transfer is disabled for your account. Contact support.");
}
