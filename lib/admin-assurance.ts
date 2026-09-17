import type { SupabaseClient } from "@supabase/supabase-js";

// Fail closed if the authentication service cannot verify the second factor.
export async function hasRequiredAdminAssurance(client: SupabaseClient): Promise<boolean> {
  try {
    const [assurance, factors] = await Promise.all([
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
      client.auth.mfa.listFactors(),
    ]);
    if (assurance.error || factors.error || !assurance.data || !factors.data) return false;
    const enrolled = factors.data.all.some((factor) => factor.status === "verified");
    return !enrolled || assurance.data.currentLevel === "aal2";
  } catch {
    return false;
  }
}
