import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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
          <label className="block text-sm font-bold">New password<input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-bold">Confirm password<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <button type="submit" className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950">Update password</button>
        </form>
      </div>
    </main>
  );
}
