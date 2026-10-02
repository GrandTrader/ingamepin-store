import styles from "@/components/PasswordRenewal.module.css";
import { requirePasswordMfa } from "@/lib/password-mfa";
import { PASSWORD_RULES } from "@/lib/password-expiry";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/auth-server";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import PasswordInput from "@/components/PasswordInput";

import { updateCustomerPassword } from "../actions";

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/account?error=Password reset session is invalid or expired.");

  await requirePasswordMfa(supabase, "reset");

  return (
    <main className="bg-slate-100 px-4 py-16 text-slate-950">
      <div className={`${styles.panel} mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10`}>
        <h1 className="text-3xl font-black">Choose new password</h1>
        {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="mt-3 text-sm text-slate-600">{PASSWORD_RULES}</p>
        <form action={updateCustomerPassword} className="mt-7 space-y-5">
          <PasswordInput
            label="New password"
            name="password"
            autoComplete="new-password"
            minLength={12}
          />
          <PasswordInput
            label="Confirm password"
            name="confirm_password"
            autoComplete="new-password"
            minLength={12}
          />
          <AuthSubmitButton
            label="Update password"
            pendingLabel="Updating password..."
            className={`${styles.action} w-full rounded-xl px-5 py-3 font-black`}
          />
        </form>
      </div>
    </main>
  );
}
