"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function securityRedirect(
  kind: "error" | "success",
  message: string
): never {
  redirect(
    `/admin/security?${kind}=${encodeURIComponent(message)}`
  );
}

export async function disableAdminMfa() {
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
    redirect("/admin/login?error=Access denied");
  }

  const assuranceResult =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (
    assuranceResult.error ||
    assuranceResult.data.currentLevel !== "aal2"
  ) {
    redirect("/admin/login/verify");
  }

  const factorsResult = await supabase.auth.mfa.listFactors();

  if (factorsResult.error) {
    securityRedirect(
      "error",
      "Unable to load authenticator settings."
    );
  }

  for (const factor of factorsResult.data.totp) {
    const removalResult = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    });

    if (removalResult.error) {
      securityRedirect(
        "error",
        "Unable to turn off two-step verification."
      );
    }
  }

  await supabase.auth.refreshSession();
  revalidatePath("/admin/security");
  securityRedirect(
    "success",
    "Two-step verification turned off."
  );
}
