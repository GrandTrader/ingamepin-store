import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type BusinessSecurity = { approved: boolean; password_ready: boolean; totp_ready: boolean };
export async function businessSecurity(userId: string): Promise<BusinessSecurity> {
  const { data, error } = await createAdminClient().rpc("business_security_status", { p_user: userId });
  if (error || !data || ["approved", "password_ready", "totp_ready"].some(key => typeof data[key] !== "boolean")) throw Error("Unable to check business account security. Please try again.");
  return data;
}
export async function businessMfaState(client: SupabaseClient) {
  const [factors, assurance] = await Promise.all([client.auth.mfa.listFactors(), client.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if (factors.error || assurance.error || !factors.data || !assurance.data) throw Error("Unable to check two-step verification. Please try again.");
  const totp = factors.data.totp.filter(f => f.status === "verified");
  const methods = assurance.data.currentAuthenticationMethods;
  const verified = assurance.data.currentLevel === "aal2" && methods.some(m => ["totp", "mfa/totp"].includes(typeof m === "string" ? m : m.method));
  return { factors: totp, verified: totp.length > 0 && verified };
}
export async function businessSessionReady(client: SupabaseClient, userId: string) {
  const security = await businessSecurity(userId);
  if (!security.approved || !security.password_ready || !security.totp_ready) return false;
  return (await businessMfaState(client)).verified;
}
