import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { saveAffiliateSettings } from "./actions";

export const dynamic = "force-dynamic";

type AffiliateSettings = {
  program_enabled: boolean;
  minimum_payout: number;
  holding_days: number;
  payout_networks: string[];
  cookie_days: number;
};

const payoutNetworks = [
  { id: "TRC20", label: "USDT TRC20", description: "TRON network" },
  { id: "BEP20", label: "USDT BEP20", description: "BNB Smart Chain" },
  { id: "SOLANA", label: "USDT Solana", description: "Solana network" },
] as const;

export default async function AffiliateSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");

  const settingsResult = await createAdminClient()
    .from("affiliate_settings")
    .select(
      "program_enabled, minimum_payout, holding_days, payout_networks, cookie_days",
    )
    .eq("id", 1)
    .maybeSingle();

  if (settingsResult.error) {
    throw new Error(
      `Unable to load affiliate settings: ${settingsResult.error.message}`,
    );
  }

  const settings = (settingsResult.data ?? {
    program_enabled: false,
    minimum_payout: 25,
    holding_days: 7,
    payout_networks: ["TRC20", "BEP20", "SOLANA"],
    cookie_days: 30,
  }) as AffiliateSettings;

  const enabledNetworks = new Set(settings.payout_networks ?? []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                Marketing
              </p>
              <h1 className="mt-2 text-3xl font-black">Affiliate Settings</h1>
              <p className="mt-2 text-sm text-slate-500">
                Control affiliate registration, commission holding and crypto payouts.
              </p>
            </div>

            <Link
              href="/admin/affiliates/promoters"
              className="rounded-xl bg-slate-900 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-blue-700"
            >
              Manage Promoters
            </Link>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              {success}
            </div>
          )}

          <form action={saveAffiliateSettings} className="mt-8 max-w-3xl space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6">
              <label className="flex cursor-pointer items-start justify-between gap-5">
                <span>
                  <span className="block text-lg font-black">Affiliate program</span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Allow customers to apply and promote InGamePin products.
                  </span>
                </span>
                <input
                  name="program_enabled"
                  type="checkbox"
                  defaultChecked={settings.program_enabled}
                  className="mt-1 h-6 w-6 shrink-0 accent-blue-600"
                />
              </label>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Commission protection</h2>
              <p className="mt-1 text-sm text-slate-500">
                Commission remains pending during this period before becoming withdrawable.
              </p>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-bold text-slate-700">Holding period</span>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 focus-within:border-blue-500">
                    <input
                      name="holding_days"
                      type="number"
                      min="0"
                      max="90"
                      step="1"
                      required
                      defaultValue={settings.holding_days}
                      className="min-w-0 flex-1 px-4 py-3 outline-none"
                    />
                    <span className="bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                      days
                    </span>
                  </div>
                </label>

                <label>
                  <span className="text-sm font-bold text-slate-700">Referral tracking</span>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 focus-within:border-blue-500">
                    <input
                      name="cookie_days"
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      required
                      defaultValue={settings.cookie_days}
                      className="min-w-0 flex-1 px-4 py-3 outline-none"
                    />
                    <span className="bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                      days
                    </span>
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Affiliate payouts</h2>
              <p className="mt-1 text-sm text-slate-500">
                Affiliates withdraw their full available balance using an enabled USDT network.
              </p>

              <label className="mt-5 block max-w-sm">
                <span className="text-sm font-bold text-slate-700">Minimum payout</span>
                <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 focus-within:border-blue-500">
                  <input
                    name="minimum_payout"
                    type="number"
                    min="1"
                    max="100000"
                    step="0.01"
                    required
                    defaultValue={Number(settings.minimum_payout)}
                    className="min-w-0 flex-1 px-4 py-3 outline-none"
                  />
                  <span className="bg-slate-50 px-4 py-3 text-sm font-black text-slate-600">
                    USDT
                  </span>
                </div>
              </label>

              <fieldset className="mt-6">
                <legend className="text-sm font-bold text-slate-700">
                  Allowed payout networks
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {payoutNetworks.map((network) => (
                    <label
                      key={network.id}
                      className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300"
                    >
                      <input
                        name="payout_networks"
                        value={network.id}
                        type="checkbox"
                        defaultChecked={enabledNetworks.has(network.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
                      />
                      <span>
                        <span className="block text-sm font-black">{network.label}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {network.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-7 py-3 font-black text-white transition hover:bg-blue-700"
            >
              Save affiliate settings
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
