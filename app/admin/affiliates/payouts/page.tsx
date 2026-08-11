import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../AdminSidebar";
import {
  approveAffiliatePayout,
  markAffiliatePayoutPaid,
  rejectAffiliatePayout,
} from "./actions";

export const dynamic = "force-dynamic";

type PayoutRequest = {
  id: string;
  affiliate_id: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  network: string;
  wallet_address: string;
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "CANCELLED";
  transaction_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  paid_at: string | null;
};

type AffiliateAccount = {
  id: string;
  full_name: string;
  affiliate_code: string;
};

export default async function AffiliatePayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const accessResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!accessResult.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  await admin.rpc("release_mature_affiliate_commissions");

  const payoutResult = await admin
    .from("affiliate_payout_requests")
    .select(
      "id, affiliate_id, amount, fee_amount, net_amount, network, wallet_address, status, transaction_id, rejection_reason, created_at, paid_at",
    )
    .order("created_at", { ascending: false });

  if (payoutResult.error) {
    throw new Error(`Unable to load affiliate payouts: ${payoutResult.error.message}`);
  }

  const payouts = (payoutResult.data ?? []) as PayoutRequest[];
  const affiliateIds = [...new Set(payouts.map((payout) => payout.affiliate_id))];
  const accountsResult = affiliateIds.length
    ? await admin
        .from("affiliate_accounts")
        .select("id, full_name, affiliate_code")
        .in("id", affiliateIds)
    : { data: [], error: null };

  if (accountsResult.error) {
    throw new Error(`Unable to load affiliate accounts: ${accountsResult.error.message}`);
  }

  const accountById = new Map(
    ((accountsResult.data ?? []) as AffiliateAccount[]).map((account) => [
      account.id,
      account,
    ]),
  );
  const pendingCount = payouts.filter((payout) => payout.status === "PENDING").length;
  const approvedCount = payouts.filter((payout) => payout.status === "APPROVED").length;
  const paidTotal = payouts
    .filter((payout) => payout.status === "PAID")
    .reduce((total, payout) => total + Number(payout.net_amount), 0);

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
              <h1 className="mt-2 text-3xl font-black">Payout Requests</h1>
              <p className="mt-2 text-sm text-slate-500">
                Review requests, send USDT manually, then record the transaction ID.
              </p>
            </div>
            <Link
              href="/admin/affiliates"
              className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold"
            >
              ← Affiliate Settings
            </Link>
          </header>

          {success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</div>}
          {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

          <section className="mt-7 grid gap-4 sm:grid-cols-3">
            <Summary label="Pending review" value={String(pendingCount)} />
            <Summary label="Approved to send" value={String(approvedCount)} />
            <Summary label="Total paid" value={`${paidTotal.toFixed(2)} USDT`} />
          </section>

          <section className="mt-8 space-y-5">
            {payouts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No affiliate payout requests yet.
              </div>
            ) : (
              payouts.map((payout) => {
                const account = accountById.get(payout.affiliate_id);
                return (
                  <article key={payout.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-black">{account?.full_name ?? "Affiliate"}</h2>
                          <StatusBadge status={payout.status} />
                        </div>
                        <p className="mt-1 text-sm font-bold text-blue-600">{account?.affiliate_code ?? payout.affiliate_id}</p>
                        <p className="mt-2 text-xs text-slate-500">Requested {new Date(payout.created_at).toLocaleString("en-IN")}</p>
                      </div>
                      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3 xl:min-w-[520px]">
                        <Amount label="Gross" value={Number(payout.amount)} />
                        <Amount label="Fee" value={Number(payout.fee_amount)} />
                        <Amount label="Send" value={Number(payout.net_amount)} highlight />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-[180px_1fr]">
                      <div><p className="text-xs font-bold uppercase text-slate-400">Network</p><p className="mt-1 font-black">USDT {payout.network}</p></div>
                      <div><p className="text-xs font-bold uppercase text-slate-400">Wallet address</p><p className="mt-1 break-all font-mono text-sm font-bold">{payout.wallet_address}</p></div>
                    </div>

                    {payout.status === "PENDING" && (
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <form action={approveAffiliatePayout}>
                          <input type="hidden" name="request_id" value={payout.id} />
                          <button className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-700">Approve payout</button>
                        </form>
                        <form action={rejectAffiliatePayout} className="flex gap-2">
                          <input type="hidden" name="request_id" value={payout.id} />
                          <input name="reason" required minLength={3} maxLength={500} placeholder="Rejection reason" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-red-500" />
                          <button className="rounded-xl bg-red-600 px-5 py-3 font-black text-white hover:bg-red-700">Reject</button>
                        </form>
                      </div>
                    )}

                    {payout.status === "APPROVED" && (
                      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
                        <form action={markAffiliatePayoutPaid} className="flex flex-col gap-2 sm:flex-row">
                          <input type="hidden" name="request_id" value={payout.id} />
                          <input name="transaction_id" required minLength={6} maxLength={200} placeholder="USDT transaction ID / hash" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 font-mono outline-none focus:border-blue-500" />
                          <button className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700">Mark paid</button>
                        </form>
                        <form action={rejectAffiliatePayout} className="flex gap-2">
                          <input type="hidden" name="request_id" value={payout.id} />
                          <input type="hidden" name="reason" value="Payout cancelled before payment." />
                          <button className="rounded-xl border border-red-200 px-5 py-3 font-black text-red-600 hover:bg-red-50">Cancel payout</button>
                        </form>
                      </div>
                    )}

                    {payout.transaction_id && <p className="mt-5 break-all rounded-xl bg-emerald-50 p-4 font-mono text-sm text-emerald-800">Transaction: {payout.transaction_id}</p>}
                    {payout.rejection_reason && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">Reason: {payout.rejection_reason}</p>}
                  </article>
                );
              })
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function Amount({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return <div><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className={`mt-1 font-black ${highlight ? "text-emerald-700" : ""}`}>{value.toFixed(2)} USDT</p></div>;
}

function StatusBadge({ status }: { status: PayoutRequest["status"] }) {
  const colors: Record<PayoutRequest["status"], string> = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-blue-100 text-blue-800",
    PAID: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-slate-200 text-slate-700",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${colors[status]}`}>{status}</span>;
}
