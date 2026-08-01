import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const WALLET_TOPUP_EXPIRY_MINUTES = 30;

export async function expireStaleWalletTopups(userId: string) {
  const cutoff = new Date(
    Date.now() - WALLET_TOPUP_EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  const result = await createAdminClient()
    .from("wallet_topup_requests")
    .update({
      status: "EXPIRED",
      rejection_reason: "Payment session expired. Start a new top-up if you still want to add money.",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "PENDING")
    .lt("created_at", cutoff);

  if (result.error) {
    throw new Error(`Unable to expire old wallet top-ups: ${result.error.message}`);
  }
}
