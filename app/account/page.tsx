import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import PasswordInput from "@/components/PasswordInput";
import RegistrationTurnstile from "@/components/RegistrationTurnstile";

import { customerLogin } from "./actions";
import CustomerPasskeyLoginButton from "./CustomerPasskeyLoginButton";

type AccountPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/account/dashboard");

  return (
    <div className="bg-slate-100 px-4 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
        <section className="p-5 sm:p-7" aria-labelledby="login-title">
          <h1 id="login-title" className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Access your orders and wallet.</p>

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

          <form action={customerLogin} className="mt-5 space-y-4">
            <label className="block text-sm font-bold">Email address
              <input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500" placeholder="customer@example.com" />
            </label>
            <PasswordInput
              label="Password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
            />
            <RegistrationTurnstile message="Complete the security check to sign in." />
            <AuthSubmitButton
              label="Sign in"
              pendingLabel="Signing in..."
              className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
            </div>
            <CustomerPasskeyLoginButton />
          </form>

          <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm font-bold">
            <Link className="text-slate-500 hover:text-cyan-600" href="/account/forgot-password">Forgot password?</Link>
            <Link className="text-cyan-600 hover:text-cyan-500" href="/account/register">Create account</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
