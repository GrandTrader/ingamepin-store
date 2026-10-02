import styles from "@/components/PasswordRenewal.module.css";
import { requirePasswordMfa } from "@/lib/password-mfa";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";
import { getPasswordExpiry, PASSWORD_RULES } from "@/lib/password-expiry";
import { getAdminMfaState } from "@/lib/admin-assurance";
import PasswordInput from "@/components/PasswordInput";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import { renewPassword, sendRenewalCode, signOutForRenewal } from "./actions";

export const dynamic = "force-dynamic";
export default async function RenewPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const { error, success } = await searchParams;
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) redirect("/account");
  const membership = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (membership.error) throw new Error("Unable to verify account security. Please try again.");
  if (membership.data) {
    const state = await getAdminMfaState(client);
    if (state === "error") throw new Error("Unable to verify two-step verification. Please try again.");
    if (state !== "ready") redirect(state === "setup" ? "/admin/login/setup" : "/admin/login/verify");
  }
  await requirePasswordMfa(client, "renew");
  const expiry = await getPasswordExpiry(client);
  return (
    <main className="bg-slate-100 px-4 py-8 text-slate-950 sm:py-12">
      <section className={`${styles.panel} mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7`}>
        <h1 className="text-2xl font-bold">{expiry.required ? "Update your expired password" : "Change your password"}</h1>
        <p className="mt-2 text-sm text-slate-600">{expiry.required ? "Your password has reached its 365-day limit. Choose a new password to continue using your account." : "Passwords must be changed at least every 365 days."}</p>
        <p className="mt-3 text-sm text-slate-600">{PASSWORD_RULES}</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
        <form action={renewPassword} className="mt-5 space-y-4">
          <PasswordInput label="Current password" name="current_password" autoComplete="current-password" minLength={1} />
          <PasswordInput label="New password" name="password" autoComplete="new-password" minLength={12} />
          <PasswordInput label="Confirm new password" name="confirm_password" autoComplete="new-password" minLength={12} />
          <label className="block text-sm font-bold">Email verification code (if requested)
            <input name="verification_code" autoComplete="one-time-code" inputMode="numeric" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <AuthSubmitButton label="Update password" pendingLabel="Updating password..." className={`${styles.action} w-full rounded-xl px-5 py-3 font-black`} />
        </form>
        <form action={sendRenewalCode} className="mt-4"><button className={`${styles.link} text-sm font-bold underline`}>Send email verification code</button></form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm font-bold">
          <Link href="/account/forgot-password" className={`${styles.link} underline`}>Forgot password?</Link>
          <form action={signOutForRenewal}><button className="text-slate-600 underline">Sign out</button></form>
        </div>
      </section>
    </main>
  );
}
