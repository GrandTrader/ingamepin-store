import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomer } from "@/lib/customer-account-data";
import CustomerAccountShell from "../CustomerAccountShell";
import AffiliateProductLink from "./AffiliateProductLink";
import {
  createAffiliatePayoutRequest,
  submitAffiliateApplication,
} from "./actions";

countries.registerLocale(englishCountries);

const promotionChannels = [
  ["WEBSITE", "Website or blog"],
  ["YOUTUBE", "YouTube"],
  ["TELEGRAM", "Telegram"],
  ["SOCIAL_MEDIA", "Social media"],
  ["OTHER", "Other"],
] as const;

const statusStyles = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-slate-200 text-slate-700",
} as const;

export const dynamic = "force-dynamic";

export default async function CustomerAffiliatePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;
  const { user, supabase, displayName } = await requireCustomer();

  const [accountResult, settingsResult] = await Promise.all([
    supabase
      .from("affiliate_accounts")
      .select(
        "id, affiliate_code, status, full_name, country_code, promotion_channel, promotion_url, promotion_plan, rejection_reason, commission_override_percent, payout_network, payout_address",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    createAdminClient()
      .from("affiliate_settings")
      .select("program_enabled, minimum_payout, payout_fee, payout_networks")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (accountResult.error) {
    throw new Error(`Unable to load affiliate account: ${accountResult.error.message}`);
  }

  const account = accountResult.data;
  const programEnabled = settingsResult.data?.program_enabled === true;
  const canApply =
    programEnabled &&
    (!account || account.status === "PENDING" || account.status === "REJECTED");

  const admin = createAdminClient();
  const approvedAccount = account?.status === "APPROVED" ? account : null;

  const [productsResult, clicksResult, commissionsResult] = approvedAccount
    ? await Promise.all([
        admin
          .from("products")
          .select("id, name, slug, affiliate_commission_percent")
          .eq("status", "ACTIVE")
          .eq("affiliate_enabled", true)
          .gt("affiliate_commission_percent", 0)
          .order("name", { ascending: true }),
        admin
          .from("affiliate_clicks")
          .select("id", { count: "exact", head: true })
          .eq("affiliate_id", approvedAccount.id),
        admin
          .from("affiliate_commissions")
          .select("commission_amount, status")
          .eq("affiliate_id", approvedAccount.id),
      ])
    : [
        { data: [], error: null },
        { count: 0, error: null },
        { data: [], error: null },
      ];

  if (productsResult.error) {
    throw new Error(`Unable to load affiliate products: ${productsResult.error.message}`);
  }

  if (clicksResult.error) {
    throw new Error(`Unable to load affiliate clicks: ${clicksResult.error.message}`);
  }

  if (commissionsResult.error) {
    throw new Error(
      `Unable to load affiliate commissions: ${commissionsResult.error.message}`,
    );
  }

  const commissions = commissionsResult.data ?? [];
  const salesCount = commissions.length;
  const pendingBalance = commissions
    .filter((commission) => commission.status === "PENDING")
    .reduce((total, commission) => total + Number(commission.commission_amount), 0);
  const availableBalance = commissions
    .filter((commission) => commission.status === "AVAILABLE")
    .reduce((total, commission) => total + Number(commission.commission_amount), 0);

  const payoutRequestsResult = approvedAccount
    ? await admin
        .from("affiliate_payout_requests")
        .select(
          "id, amount, fee_amount, net_amount, network, wallet_address, status, transaction_id, created_at",
        )
        .eq("affiliate_id", approvedAccount.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [], error: null };

  if (payoutRequestsResult.error) {
    throw new Error(
      `Unable to load affiliate payouts: ${payoutRequestsResult.error.message}`,
    );
  }

  const productRatesResult = approvedAccount
    ? await admin
        .from("affiliate_product_rates")
        .select("product_id, commission_percent")
        .eq("affiliate_id", approvedAccount.id)
    : { data: [], error: null };

  if (productRatesResult.error) {
    throw new Error(
      `Unable to load affiliate product rates: ${productRatesResult.error.message}`,
    );
  }

  const productRateById = new Map(
    (productRatesResult.data ?? []).map((rate) => [
      rate.product_id,
      Number(rate.commission_percent),
    ]),
  );

  const minimumPayout = Number(settingsResult.data?.minimum_payout ?? 25);
  const payoutFee = Number(settingsResult.data?.payout_fee ?? 3);
  const payoutNetworks: string[] = Array.isArray(
    settingsResult.data?.payout_networks,
  )
    ? settingsResult.data.payout_networks.map(String)
    : ["TRC20", "BEP20", "SOLANA"];

  const countryOptions = Object.keys(countries.getAlpha2Codes())
    .map((code) => ({
      code,
      name: countries.getName(code, "en") ?? code,
    }))
    .sort((first, second) => first.name.localeCompare(second.name, "en"));

  return (
    <CustomerAccountShell displayName={displayName}>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
        Marketing partners
      </p>
      <h1 className="mt-2 text-3xl font-black">Affiliate Program</h1>
      <p className="mt-2 text-slate-500">
        Apply to promote InGamePin products and earn commission from approved sales.
      </p>

      {success && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {success}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {account && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Affiliate code</p>
              <p className="mt-1 text-2xl font-black">{account.affiliate_code}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                statusStyles[account.status as keyof typeof statusStyles]
              }`}
            >
              {account.status}
            </span>
          </div>

          <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                Promotion channel
              </p>
              <p className="mt-1 font-bold">
                {account.promotion_channel.replaceAll("_", " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                Commission
              </p>
              <p className="mt-1 font-bold">
                {account.commission_override_percent
                  ? `${Number(account.commission_override_percent)}% custom rate`
                  : "Product default rate"}
              </p>
            </div>
          </div>

          {account.status === "PENDING" && (
            <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              Your application is waiting for administrator review.
            </p>
          )}

          {account.status === "REJECTED" && (
            <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-700">
              {account.rejection_reason ||
                "Your application was not approved. You may update it and apply again."}
            </p>
          )}
        </section>
      )}

      {approvedAccount && (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Link clicks", String(clicksResult.count ?? 0)],
              ["Approved sales", String(salesCount)],
              ["Available balance", `${availableBalance.toFixed(2)} USDT`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
              </div>
            ))}
          </section>

          {pendingBalance > 0 && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Pending commission: {pendingBalance.toFixed(2)} USDT
            </p>
          )}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Promote products</h2>
            <p className="mt-1 text-sm text-slate-500">
              Copy a product link and share it with your audience.
            </p>

            <div className="mt-5 grid gap-4">
              {(productsResult.data ?? []).map((product) => (
                <AffiliateProductLink
                  key={product.id}
                  affiliateCode={approvedAccount.affiliate_code}
                  productId={product.id}
                  productName={product.name}
                  productSlug={product.slug}
                  maximumCommissionPercent={Number(
                    approvedAccount.commission_override_percent ??
                      product.affiliate_commission_percent,
                  )}
                  selectedCommissionPercent={Math.min(
                    productRateById.get(product.id) ??
                      Number(
                        approvedAccount.commission_override_percent ??
                          product.affiliate_commission_percent,
                      ),
                    Number(
                      approvedAccount.commission_override_percent ??
                        product.affiliate_commission_percent,
                    ),
                  )}
                />
              ))}

              {(productsResult.data ?? []).length === 0 && (
                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                  No products are currently enabled for affiliate promotion.
                </p>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Request payout</h2>
            <p className="mt-1 text-sm text-slate-500">
              Payouts are reviewed and sent manually by the administrator.
            </p>

            <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Available
                </p>
                <p className="mt-1 font-black">{availableBalance.toFixed(2)} USDT</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Fixed fee
                </p>
                <p className="mt-1 font-black text-red-600">-{payoutFee.toFixed(2)} USDT</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  You receive
                </p>
                <p className="mt-1 font-black text-emerald-700">
                  {Math.max(availableBalance - payoutFee, 0).toFixed(2)} USDT
                </p>
              </div>
            </div>

            {availableBalance >= minimumPayout ? (
              <form action={createAffiliatePayoutRequest} className="mt-5 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="amount" value={availableBalance.toFixed(2)} />

                <label>
                  <span className="text-sm font-bold">USDT network</span>
                  <select
                    name="network"
                    required
                    defaultValue={approvedAccount.payout_network ?? payoutNetworks[0]}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-500"
                  >
                    {payoutNetworks.map((network) => (
                      <option key={network} value={network}>
                        USDT {network}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-bold">USDT wallet address</span>
                  <input
                    name="wallet_address"
                    required
                    minLength={20}
                    maxLength={150}
                    defaultValue={approvedAccount.payout_address ?? ""}
                    placeholder="Enter the address for the selected network"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-6 py-3 font-black text-white transition hover:bg-cyan-600 sm:col-span-2"
                >
                  Request {Math.max(availableBalance - payoutFee, 0).toFixed(2)} USDT payout
                </button>
              </form>
            ) : (
              <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Minimum payout request: {minimumPayout.toFixed(2)} USDT.
              </p>
            )}

            {(payoutRequestsResult.data ?? []).length > 0 && (
              <div className="mt-7 border-t border-slate-200 pt-5">
                <h3 className="font-black">Payout history</h3>
                <div className="mt-3 grid gap-3">
                  {(payoutRequestsResult.data ?? []).map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-black">
                          {Number(request.net_amount).toFixed(2)} USDT via {request.network}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Gross {Number(request.amount).toFixed(2)} · Fee {Number(request.fee_amount).toFixed(2)} USDT
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {request.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {!programEnabled && !account && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-7 text-slate-500">
          Affiliate applications are currently closed.
        </div>
      )}

      {canApply && (
        <form
          action={submitAffiliateApplication}
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-xl font-black">
            {account ? "Update application" : "Affiliate application"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Tell us where and how you plan to promote InGamePin.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label>
              <span className="text-sm font-bold">Full name</span>
              <input
                name="full_name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={account?.full_name ?? displayName}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
              />
            </label>

            <label>
              <span className="text-sm font-bold">Country</span>
              <select
                name="country_code"
                required
                defaultValue={account?.country_code ?? "IN"}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-500"
              >
                {countryOptions.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-bold">Main promotion channel</span>
              <select
                name="promotion_channel"
                required
                defaultValue={account?.promotion_channel ?? "SOCIAL_MEDIA"}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-500"
              >
                {promotionChannels.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-bold">Promotion page URL</span>
              <input
                name="promotion_url"
                type="url"
                maxLength={500}
                defaultValue={account?.promotion_url ?? ""}
                placeholder="https://example.com/your-page"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Promotion plan</span>
              <textarea
                name="promotion_plan"
                required
                minLength={20}
                maxLength={2000}
                rows={6}
                defaultValue={account?.promotion_plan ?? ""}
                placeholder="Explain how and where you will promote InGamePin products."
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
              />
            </label>
          </div>

          <button
            type="submit"
            className="mt-6 rounded-xl bg-cyan-500 px-7 py-3 font-black text-slate-950 transition hover:bg-cyan-400"
          >
            Submit Application
          </button>
        </form>
      )}
    </CustomerAccountShell>
  );
}
