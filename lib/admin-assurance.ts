import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminMfaState = "ready" | "setup" | "verify" | "error";

// Enrollment alone is insufficient: each administrator session must verify MFA.
export async function getAdminMfaState(client: SupabaseClient): Promise<AdminMfaState> {
  try {
    const [assurance, factors] = await Promise.all([
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
      client.auth.mfa.listFactors(),
    ]);
    if (assurance.error || factors.error || !assurance.data || !factors.data || !Array.isArray(factors.data.all)) return "error";
    const enrolled = factors.data.all.some((factor) => factor.status === "verified");
    if (!enrolled) return "setup";
    return assurance.data.currentLevel === "aal2" ? "ready" : "verify";
  } catch {
    return "error";
  }
}

export async function hasRequiredAdminAssurance(client: SupabaseClient): Promise<boolean> {
  return (await getAdminMfaState(client)) === "ready";
}
