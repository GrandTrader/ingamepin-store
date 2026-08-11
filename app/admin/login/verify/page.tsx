import Link from "next/link";
import { redirect } from "next/navigation";

import MfaVerificationForm from "./MfaVerificationForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AdminMfaVerifyPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminMfaVerifyPage({
  searchParams,
}: AdminMfaVerifyPageProps) {
  const { error } = await searchParams;
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

  const [assuranceResult, factorsResult] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (
    !assuranceResult.error &&
    assuranceResult.data.currentLevel === "aal2"
  ) {
    redirect("/admin");
  }

  const hasVerifiedFactor =
    !factorsResult.error &&
    factorsResult.data.totp.some(
      (factor) => factor.status === "verified"
    );

  if (!hasVerifiedFactor) {
    redirect("/admin/login/setup");
  }

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl sm:p-9">
        <Link
          href="/"
          className="text-sm font-bold text-cyan-400 hover:text-cyan-300"
        >
          {"\u2190"} Return to store
        </Link>

        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-cyan-400">
          Admin security
        </p>
        <h1 className="mt-3 text-3xl font-black">
          Verification required
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Enter the current 6-digit code from Google Authenticator for {user.email}.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <MfaVerificationForm />
      </section>
    </main>
  );
}
