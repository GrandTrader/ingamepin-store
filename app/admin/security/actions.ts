"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/admin-session";

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

  // Keep old form submissions safe as well as removing the disable control.
  securityRedirect("error", "Two-step verification is required for administrator accounts and cannot be turned off.");
}
