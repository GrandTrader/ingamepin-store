import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";
import { businessMfaState, businessSecurity } from "@/lib/business-security";
import { PASSWORD_RULES } from "@/lib/password-expiry";
import BusinessActionForm from "@/components/BusinessActionForm";
import PasswordInput from "@/components/PasswordInput";
import BusinessAuthenticator from "./BusinessAuthenticator";
import { setBusinessPassword, verifyBusinessAuthenticator } from "./actions";
export const dynamic = "force-dynamic";

export default async function BusinessSetupPage() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at) redirect("/account?error=Sign%20in%20to%20set%20up%20your%20business%20account.");
  const security = await businessSecurity(user.id);
  if (!security.approved) redirect("/account/business");
  const mfa = await businessMfaState(client);
  const verifyExisting = mfa.factors.length > 0 && !mfa.verified;
  if (security.password_ready && security.totp_ready && mfa.verified) redirect("/account/portal");
  return <main className="bg-slate-50 px-4 py-8 text-slate-900"><section className="mx-auto max-w-md space-y-5 rounded-2xl border bg-white p-5 sm:p-7">
    <h1 className="text-2xl font-black">{verifyExisting ? "Verify Google Authenticator" : !security.password_ready ? "Create your business password" : "Set up Google Authenticator"}</h1>
    <p className="break-all text-sm text-slate-600">{user.email}</p>
    {verifyExisting ? <><p className="text-sm">Enter a code from your existing authenticator to continue securely.</p><BusinessActionForm action={verifyBusinessAuthenticator} button="Verify and continue">
      <label className="block text-sm font-bold">Authenticator<select name="factor_id" className="mt-2 w-full rounded-lg border p-3">{mfa.factors.map(f=><option key={f.id} value={f.id}>{f.friendly_name || "Google Authenticator"}</option>)}</select></label>
      <label className="block text-sm font-bold">6-digit code<input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-lg border p-3"/></label>
    </BusinessActionForm></> : !security.password_ready ? <><p className="text-sm text-slate-600">{PASSWORD_RULES} This password is also used for your existing InGamePin customer account.</p><BusinessActionForm action={setBusinessPassword} button="Save password and continue">
      <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={12}/>
      <PasswordInput name="confirm_password" label="Confirm password" autoComplete="new-password" minLength={12}/>
    </BusinessActionForm></> : <BusinessAuthenticator/>}
    <p className="text-xs text-slate-500">Both password setup and Google Authenticator verification are required to enter the B2B portal.</p>
    <Link href="/account/profile" className="inline-block text-sm text-blue-700">Return to profile</Link>
  </section></main>;
}
