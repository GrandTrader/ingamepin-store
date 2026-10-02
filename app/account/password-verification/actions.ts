"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";
import { passwordReturnPath } from "@/lib/password-mfa";

export async function verifyPasswordMfa(formData: FormData) {
  const target = formData.get("next") === "reset" ? "reset" : "renew";
  const fail = (message: string): never => redirect(`/account/password-verification?next=${target}&error=${encodeURIComponent(message)}`);
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/account");
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) fail("Enter the 6-digit code from your authenticator app.");
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) fail("Unable to load your authenticator. Please try again.");
  const factor = factors.data?.totp.find(item => item.status === "verified" && item.id === formData.get("factor_id"));
  if (!factor) fail("Choose a registered authenticator app.");
  const verification = await client.auth.mfa.challengeAndVerify({ factorId: factor!.id, code });
  if (verification.error) fail("The code is incorrect or expired. Please try again.");
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") fail("Verification could not be completed. Please try again.");
  redirect(passwordReturnPath(target));
}
