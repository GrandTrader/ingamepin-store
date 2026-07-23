import Link from "next/link";
import { redirect } from "next/navigation";

import { adminLogin } from "../actions";
import { createClient } from "@/lib/supabase/server";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const adminResult = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminResult.data) {
      redirect("/admin");
    }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl sm:p-9">
        <Link
          href="/"
          className="text-sm font-bold text-cyan-400 hover:text-cyan-300"
        >
          {"\u2190"} Return to store
        </Link>

        <div className="mt-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-black text-slate-950">
            IP
          </div>

          <h1 className="mt-6 text-3xl font-black">
            Admin Login
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Sign in with your authorized InGamePin
            administrator account.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <form
          action={adminLogin}
          className="mt-7 space-y-5"
        >
          <div>
            <label
              htmlFor="email"
              className="text-sm font-bold"
            >
              Administrator email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="admin@example.com"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-sm font-bold"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="Enter your password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300"
          >
            Sign in to Admin
          </button>
        </form>
      </div>
    </div>
  );
}
