import { getAdminMfaState } from "@/lib/admin-assurance";
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

  const mfaState = await getAdminMfaState(supabase);
  if (mfaState === "error") throw new Error("Unable to verify administrator security settings. Please try again.");
  if (mfaState === "ready") redirect("/admin");
  if (mfaState === "verify") redirect("/admin/login/verify");

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <AdminMfaSetup
        adminEmail={user.email ?? "Administrator"}
        hasVerifiedFactor={false}
      />
    </main>
  );
}
