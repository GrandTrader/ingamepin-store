import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { customerLogin } from "./actions";

type AccountPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/account/dashboard");

  return (
    <main className="bg-slate-100 px-4 py-12 text-slate-950 sm:py-16">
      <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
        <section className="bg-cyan-50 p-7 sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 font-black text-slate-950">IP</div>
          <h1 className="mt-7 text-3xl font-black">Welcome to InGamePin</h1>
          <p className="mt-3 leading-7 text-slate-600">Sign in to track orders, access delivered codes and manage your wallet.</p>
          <div className="mt-8 space-y-4 text-sm font-bold text-slate-700">
            <p>✓ Track every purchase</p>
            <p>✓ Access delivered codes securely</p>
            <p>✓ Pay faster with wallet balance</p>
          </div>
        </section>

        <section className="p-7 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Customer account</p>
          <h2 className="mt-2 text-3xl font-black">Login</h2>

          {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

          <form action={customerLogin} className="mt-7 space-y-5">
            <label className="block text-sm font-bold">Email address
              <input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500" placeholder="customer@example.com" />
            </label>
            <label className="block text-sm font-bold">Password
              <input name="password" type="password" required minLength={8} autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500" placeholder="Enter your password" />
            </label>
            <button className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-400" type="submit">Sign in</button>
          </form>

          <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm font-bold">
            <Link className="text-slate-500 hover:text-cyan-600" href="/account/forgot-password">Forgot password?</Link>
            <Link className="text-cyan-600 hover:text-cyan-500" href="/account/register">Create account</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
