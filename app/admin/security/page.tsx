import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import DisableMfaButton from "./DisableMfaButton";
import PasskeyManager from "./PasskeyManager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AdminSecurityPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function AdminSecurityPage({
  searchParams,
}: AdminSecurityPageProps) {
  const { error, success } = await searchParams;
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

  const factorsResult = await supabase.auth.mfa.listFactors();

  if (factorsResult.error) {
    throw new Error(
      `Unable to load security settings: ${factorsResult.error.message}`
    );
  }

  const enabled = factorsResult.data.totp.length > 0;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">
            Admin protection
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Security
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Control Google Authenticator verification for {user.email}.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {success}
            </div>
          )}

          <section className="mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black">
                    Two-step verification
                  </h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      enabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                  {enabled
                    ? "Admin login requires a current 6-digit code from Google Authenticator."
                    : "Admin login currently requires only the password and security check."}
                </p>
              </div>

              {enabled ? (
                <DisableMfaButton />
              ) : (
                <Link
                  href="/admin/login/setup"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-center font-black text-white transition hover:bg-blue-700"
                >
                  Turn on and connect app
                </Link>
              )}
            </div>
          </section>

          <section className="mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <h2 className="text-xl font-black">
              Passkey login
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in using your fingerprint, face, device PIN, or security key. Google Authenticator remains the second verification step while it is enabled.
            </p>

            <PasskeyManager />
          </section>
        </main>
      </div>
    </div>
  );
}
