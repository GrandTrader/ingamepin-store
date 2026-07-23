import Link from "next/link";

import { customerRegister } from "../actions";

type RegisterPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;

  return (
    <main className="bg-slate-100 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">InGamePin customer</p>
        <h1 className="mt-2 text-3xl font-black">Create account</h1>
        <p className="mt-2 text-slate-500">Create one secure account for orders, codes and wallet access.</p>
        {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form action={customerRegister} className="mt-7 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-bold sm:col-span-2">Full name<input name="full_name" required maxLength={100} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-bold sm:col-span-2">Email address<input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-bold sm:col-span-2">Mobile number<input name="phone" type="tel" autoComplete="tel" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-bold">Password<input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="block text-sm font-bold">Confirm password<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <button type="submit" className="rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 sm:col-span-2">Create account</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">Already registered? <Link className="font-bold text-cyan-600" href="/account">Sign in</Link></p>
      </div>
    </main>
  );
}
