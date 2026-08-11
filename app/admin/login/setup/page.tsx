import { redirect } from "next/navigation";

import AdminMfaSetup from "./AdminMfaSetup";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminMfaSetupPage() {
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
    throw new Error(
      `Unable to check authenticator status: ${factorsResult.error.message}`
    );
  }

  const hasVerifiedFactor = factorsResult.data.totp.some(
    (factor) => factor.status === "verified"
  );

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <AdminMfaSetup
        adminEmail={user.email ?? "Administrator"}
        hasVerifiedFactor={hasVerifiedFactor}
      />
    </main>
  );
}
