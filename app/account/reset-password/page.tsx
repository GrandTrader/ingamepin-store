import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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

  return (
    <main className="bg-slate-100 px-4 py-16 text-slate-950">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <h1 className="text-3xl font-black">Choose new password</h1>
        {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form action={updateCustomerPassword} className="mt-7 space-y-5">
          <PasswordInput
            label="New password"
            name="password"
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm password"
            name="confirm_password"
            autoComplete="new-password"
          />
          <AuthSubmitButton
            label="Update password"
            pendingLabel="Updating password..."
            className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>
      </div>
    </main>
  );
}
