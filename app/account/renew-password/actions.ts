"use server";

import { requirePasswordMfa } from "@/lib/password-mfa";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";
import { isStrongPassword, PASSWORD_RULES } from "@/lib/password-expiry";
import { getAuthErrorMessage } from "@/lib/auth-error-message";
import { getAdminMfaState } from "@/lib/admin-assurance";

async function renewalSession() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/account");
  const membership = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (membership.error) throw new Error("Unable to verify account security. Please try again.");
  if (membership.data) {
    const state = await getAdminMfaState(client);
    if (state === "error") throw new Error("Unable to verify two-step verification. Please try again.");
    if (state !== "ready") redirect(state === "setup" ? "/admin/login/setup" : "/admin/login/verify");
  }
  await requirePasswordMfa(client, "renew");
  return { client, isAdmin: Boolean(membership.data) };
}

function feedback(kind: "error" | "success", message: string): never {
  redirect(`/account/renew-password?${kind}=${encodeURIComponent(message)}`);
}

export async function renewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const currentPassword = String(formData.get("current_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const nonce = String(formData.get("verification_code") ?? "").trim();
  if (!isStrongPassword(password)) feedback("error", PASSWORD_RULES);
  if (!currentPassword) feedback("error", "Enter your current password, or use Forgot password.");
  if (password === currentPassword) feedback("error", "Choose a password different from your current password.");
  if (password !== confirm) feedback("error", "Passwords do not match.");
  const { client, isAdmin } = await renewalSession();
  const result = await client.auth.updateUser({ password, current_password: currentPassword, ...(nonce ? { nonce } : {}) });
  if (result.error) {
    if (["reauthentication_needed", "reauthentication_not_valid"].includes(result.error.code ?? "")) {
      feedback("error", "Request an email verification code below, then enter it with your passwords.");
    }
    if (["invalid_credentials", "current_password_mismatch"].includes(result.error.code ?? "")) feedback("error", "Your current password is incorrect.");
    if (result.error.code === "current_password_required") feedback("error", "Enter your current password, or use Forgot password.");
    feedback("error", getAuthErrorMessage(result.error, "update-password"));
  }
  // Supabase changes the hash; the database trigger alone updates its timestamp.
  await client.auth.signOut();
  redirect(`${isAdmin ? "/admin/login" : "/account"}?success=${encodeURIComponent("Password updated. Sign in with your new password.")}`);
}

export async function sendRenewalCode() {
  const { client } = await renewalSession();
  const { error } = await client.auth.reauthenticate();
  if (error) feedback("error", "Unable to send a verification code. Please wait and try again.");
  feedback("success", "Check your email for the verification code.");
}

export async function signOutForRenewal() {
  const client = await createClient();
  await client.auth.signOut();
  redirect("/account");
}
