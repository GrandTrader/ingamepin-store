import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../AdminSidebar";
import { savePromoterSettings } from "./actions";

export const dynamic = "force-dynamic";

type AffiliateAccount = {
  id: string;
  affiliate_code: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  full_name: string;
  country_code: string;
  promotion_channel: string;
  promotion_url: string | null;
  commission_override_percent: number | null;
  created_at: string;
};

const statuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;

export default async function AffiliatePromotersPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const accessResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!accessResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const accountsResult = await createAdminClient()
    .from("affiliate_accounts")
    .select(
      "id, affiliate_code, status, full_name, country_code, promotion_channel, promotion_url, commission_override_percent, created_at",
    )
    .order("created_at", { ascending: false });

  if (accountsResult.error) {
    throw new Error(`Unable to load promoters: ${accountsResult.error.message}`);
  }

  const accounts = (accountsResult.data ?? []) as AffiliateAccount[];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                Affiliate program
              </p>
              <h1 className="mt-2 text-3xl font-black">Affiliate Applications</h1>
              <p className="mt-2 text-sm text-slate-500">
                Approve promoter accounts and apply an optional custom commission.
              </p>
            </div>

            <Link
              href="/admin/affiliates"
              className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold"
            >
              ← Affiliate Settings
            </Link>
          </header>

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <section className="mt-8 space-y-4">
            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No affiliate applications have been submitted yet.
              </div>
            ) : (
              accounts.map((account) => (
                <form
                  key={account.id}
                  action={savePromoterSettings}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                >
                  <input type="hidden" name="affiliate_id" value={account.id} />

                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black">{account.full_name}</h2>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                          {account.affiliate_code}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {account.country_code} · {account.promotion_channel} · Applied {new Date(account.created_at).toLocaleDateString("en-IN")}
                      </p>
                      {account.promotion_url && (
                        <a
                          href={account.promotion_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block break-all text-sm font-bold text-blue-600 hover:underline"
                        >
                          {account.promotion_url}
                        </a>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:w-[560px]">
                      <label>
                        <span className="text-sm font-bold">Status</span>
                        <select
                          name="status"
                          defaultValue={account.status}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-sm font-bold">
                          Custom commission
                        </span>
                        <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-blue-500">
                          <input
                            name="commission_override_percent"
                            type="number"
                            min="0.01"
                            max="25"
                            step="0.01"
                            defaultValue={
                              account.commission_override_percent ?? ""
                            }
                            placeholder="Use product rate"
                            className="min-w-0 flex-1 px-4 py-3 outline-none"
                          />
                          <span className="border-l border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-500">
                            %
                          </span>
                        </div>
                      </label>

                      <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                        Leave commission empty to use each product&apos;s default affiliate percentage.
                      </p>

                      <button
                        type="submit"
                        className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 sm:col-span-2"
                      >
                        Save Promoter
                      </button>
                    </div>
                  </div>
                </form>
              ))
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
