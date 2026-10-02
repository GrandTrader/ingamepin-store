import type { SupabaseClient } from "@supabase/supabase-js";

export const PASSWORD_RULES = "Use at least 12 characters, including uppercase and lowercase letters, a number and a symbol.";
export function isStrongPassword(password: string): boolean {
  return password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

export type PasswordExpiry = { required: boolean; expiresAt: string | null };
export async function getPasswordExpiry(client: SupabaseClient): Promise<PasswordExpiry> {
  const { data, error } = await client.rpc("password_expiry_status");
  if (error || !data || typeof data.required !== "boolean" ||
      (data.expires_at !== null && typeof data.expires_at !== "string")) {
    throw new Error("Unable to verify password expiry. Please try again.");
  }
  return { required: data.required, expiresAt: data.expires_at };
}

export function isPasswordRecoveryPath(path: string): boolean {
  return ["/account/password-verification", "/account/renew-password", "/account/reset-password", "/account/forgot-password", "/account/callback", "/admin/login", "/admin/login/setup", "/admin/login/verify"].includes(path);
}
