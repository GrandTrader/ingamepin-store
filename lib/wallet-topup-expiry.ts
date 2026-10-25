import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const WALLET_TOPUP_EXPIRY_MINUTES = 30;

// The database clock and row locks serialize timeouts with payment completion.
export async function expireStaleWalletTopups(userId?: string): Promise<number> {
  const result = await createAdminClient().rpc("reject_stale_wallet_topups", {
    p_user_id: userId ?? null,
  });

  if (result.error) {
    throw new Error("Unable to reject old wallet top-ups.");
  }

  return Number(result.data ?? 0);
}
