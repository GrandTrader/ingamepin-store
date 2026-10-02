import styles from "@/components/PasswordRenewal.module.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";
import { getAdminMfaState } from "@/lib/admin-assurance";
import { passwordReturnPath } from "@/lib/password-mfa";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import { signOutForRenewal } from "../renew-password/actions";
import { verifyPasswordMfa } from "./actions";

export default async function PasswordVerificationPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const target = params.next === "reset" ? "reset" : "renew";
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/account");
  const state = await getAdminMfaState(client);
  if (state === "error") throw new Error("Unable to verify account security. Please try again.");
  if (state !== "verify") redirect(passwordReturnPath(target));
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw new Error("Unable to load your authenticator. Please try again.");
  const authenticators = factors.data.totp.filter(factor => factor.status === "verified");
  return (
    <main className="bg-slate-100 px-4 py-12 text-slate-950">
      <section className={`${styles.panel} mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm`}>
        <h1 className="text-2xl font-bold">Verify your authenticator</h1>
        <p className="mt-3 text-sm text-slate-600">Enter your authenticator code before changing your password.</p>
        {params.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{params.error}</p>}
        {authenticators.length ? <form action={verifyPasswordMfa} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={target} />
          <label className="block text-sm font-bold">Authenticator
            <select name="factor_id" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3">
              {authenticators.map(factor => <option key={factor.id} value={factor.id}>{factor.friendly_name || "Authenticator app"}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">6-digit code
            <input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <AuthSubmitButton label="Verify and continue" pendingLabel="Verifying..." className={`${styles.action} w-full rounded-xl px-5 py-3 font-black`} />
        </form> : <p role="alert" className="mt-4 text-sm text-red-700">No supported authenticator is available. Contact support for account recovery.</p>}
        <form action={signOutForRenewal} className="mt-5"><button className="text-sm text-slate-600 underline">Sign out</button></form>
      </section>
    </main>
  );
}
