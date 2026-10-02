import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getAdminMfaState } from "@/lib/admin-assurance";

export function passwordReturnPath(target: unknown) {
  return target === "reset" ? "/account/reset-password" : "/account/renew-password";
}

// Existing factors must be verified during password recovery as well as renewal.
export async function requirePasswordMfa(client: SupabaseClient, target: "reset" | "renew") {
  const state = await getAdminMfaState(client);
  if (state === "error") throw new Error("Unable to verify account security. Please try again.");
  if (state === "verify") redirect(`/account/password-verification?next=${target}`);
}
