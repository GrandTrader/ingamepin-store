"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function verificationError(message: string): never {
  redirect(
    `/admin/login/verify?error=${encodeURIComponent(message)}`
  );
}

export async function verifyAdminMfa(formData: FormData) {
  const code = String(
    formData.get("verification_code") ?? ""
  )
    .replace(/\D/g, "")
    .slice(0, 6);

  if (code.length !== 6) {
    verificationError(
      "Enter the 6-digit code from Google Authenticator."
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminResult.error || !adminResult.data) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }

  const factorsResult = await supabase.auth.mfa.listFactors();

  if (factorsResult.error) {
    verificationError(
      "Unable to load the administrator authenticator."
    );
  }

  const factor = factorsResult.data.totp.find(
    (item) => item.status === "verified"
  );

  if (!factor) {
    redirect("/admin/login/setup");
  }

  const verificationResult =
    await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });

  if (verificationResult.error) {
    verificationError(
      "The verification code is incorrect or expired."
    );
  }

  const assuranceResult =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (
    assuranceResult.error ||
    assuranceResult.data.currentLevel !== "aal2"
  ) {
    verificationError(
      "Two-step verification could not be completed."
    );
  }

  redirect("/admin");
}
