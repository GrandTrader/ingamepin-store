"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/auth-server";
import { businessMfaState, businessSecurity } from "@/lib/business-security";
import { isStrongPassword, PASSWORD_RULES } from "@/lib/password-expiry";

async function setupAccount() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at) throw Error("Sign in with your verified account email.");
  if (!(await businessSecurity(user.id)).approved) throw Error("An approved business account is required.");
  return { client, user };
}
export async function acceptBusinessSetupEmail(tokenHash: string) {
  if (typeof tokenHash !== "string" || !/^[a-zA-Z0-9_-]{32,256}$/.test(tokenHash)) return { error: "This setup link is invalid. Ask support to resend it." };
  const client = await createClient();
  const result = await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (result.error || !result.data.user) return { error: "This setup link is invalid or expired. Ask support to resend it." };
  if (!(await businessSecurity(result.data.user.id)).approved) {
    await client.auth.signOut();
    return { error: "This business account is no longer approved. Please contact support." };
  }
  return { success: "Continue to account setup." };
}
export async function setBusinessPassword(form: FormData) {
  try {
    const { client, user } = await setupAccount();
    const mfa = await businessMfaState(client);
    if (mfa.factors.length && !mfa.verified) return { error: "Verify your existing Google Authenticator before changing your password." };
    const password = String(form.get("password") ?? "");
    if (!isStrongPassword(password)) return { error: PASSWORD_RULES };
    if (password !== String(form.get("confirm_password") ?? "")) return { error: "Passwords do not match." };
    const update = await client.auth.updateUser({ password });
    if (update.error) return { error: "Unable to save this password. Use a different strong password or request a new setup link." };
    if (!(await businessSecurity(user.id)).password_ready) return { error: "Unable to confirm password setup. Please try again." };
    revalidatePath("/account/business/setup");
    return { success: "Password saved. Continue with Google Authenticator." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to set up the password." }; }
}
export async function verifyBusinessAuthenticator(form: FormData) {
  try {
    const { client } = await setupAccount();
    const code = String(form.get("code") ?? "").trim();
    const factorId = String(form.get("factor_id") ?? "");
    if (!/^[0-9]{6}$/.test(code)) return { error: "Enter the 6-digit code from Google Authenticator." };
    const mfa = await businessMfaState(client);
    if (!mfa.factors.some(f => f.id === factorId)) return { error: "Choose an authenticator belonging to this account." };
    const check = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (check.error || !(await businessMfaState(client)).verified) return { error: "The code is incorrect or expired. Try again." };
    revalidatePath("/account/business/setup");
    return { success: "Authenticator verified." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to verify the authenticator." }; }
}
