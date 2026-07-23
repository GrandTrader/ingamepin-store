import Link from "next/link";

import { requestPasswordReset } from "../actions";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { error, success } = await searchParams;
  return (
    <main className="bg-slate-100 px-4 py-16 text-slate-950">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <h1 className="text-3xl font-black">Reset password</h1>
        <p className="mt-2 text-slate-500">We will send a secure reset link to your email.</p>
        {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
        <form action={requestPasswordReset} className="mt-7 space-y-5">
          <label className="block text-sm font-bold">Email address<input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <button type="submit" className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950">Send reset link</button>
        </form>
        <Link className="mt-6 block text-center text-sm font-bold text-cyan-600" href="/account">Return to login</Link>
      </div>
    </main>
  );
}
