import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getWalletPaymentGateways } from "@/lib/wallet-payment-gateways";
import WalletTopupForm from "./WalletTopupForm";
import { expireStaleWalletTopups } from "@/lib/wallet-topup-expiry";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimWalletRefund } from "./actions";

export const dynamic = "force-dynamic";
type WalletPageProps = {
  searchParams: Promise<{ error?: string; success?: string; page?: string }>;
};

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function CustomerWalletPage({
  searchParams,
}: WalletPageProps) {
  const { error, success, page } = await searchParams;
  const parsedPage = typeof page === "string" && /^\d+$/.test(page) ? Number(page) : 1;
  const currentPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage < 1000000 ? parsedPage : 1;
  const pageSize = 5;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account?error=Please sign in to continue.");

  await expireStaleWalletTopups(user.id);

  const [walletResult, transactionResult, requestResult, refundResult] = await Promise.all([
    supabase
      .from("customer_wallets")
      .select("balance, currency")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("wallet_transactions")
      .select(
        "id, transaction_type, amount, balance_after, description, created_at",
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    supabase
      .from("wallet_topup_requests")
      .select(
        "id, amount, payment_method, payment_reference, status, rejection_reason, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    createAdminClient().from("order_item_refunds")
      .select("id, quantity, amount, currency, status, reason, created_at, orders(id, order_number), order_items(product_name, option_name)")
      .eq("customer_email", user.email!.toLowerCase())
      .order("created_at", { ascending: false }),
  ]);

  const wallet = walletResult.data ?? { balance: 0, currency: "USD" };
  const transactions = transactionResult.data ?? [];
  const transactionCount = transactionResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(transactionCount / pageSize));
  if (!transactionResult.error && currentPage > pageCount) redirect(`/account/wallet?page=${pageCount}#transactions`);
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const requests = requestResult.data ?? [];
  const refunds = refundResult.data ?? [];
  const gateways = getWalletPaymentGateways();
  const walletEnabled = user.app_metadata?.wallet_disabled !== true;

  return (
    <main className="bg-slate-100 px-3 py-4 sm:px-4 sm:py-6 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/account/dashboard"
          className="text-sm font-bold text-cyan-700"
        >
          ← Return to dashboard
        </Link>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <section className="flex items-center justify-between gap-3 border-b border-slate-200 bg-cyan-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-600">Wallet balance</p>
            <p className="text-2xl font-bold text-cyan-700">{formatMoney(wallet.balance)}</p>
          </section>
          <section className="p-4">
            <h1 className="text-xl font-bold">Add money</h1>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
                {success}
              </p>
            )}

            {walletEnabled ? (
              <WalletTopupForm
                gateways={gateways}
                currentBalance={Number(wallet.balance)}
              />
            ) : (
              <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">
                Your wallet is currently disabled. Contact support for assistance.
              </div>
            )}
          </section>
        </div>

        <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3" open={refunds.some(refund => refund.status === "PENDING_CLAIM")}>
          <summary className="cursor-pointer text-sm font-bold">Approved refunds</summary>
          <p className="mt-1 text-sm text-slate-500">Refunds approved for your verified account email.</p>
          <div className="mt-2 overflow-hidden">
            {refunds.length === 0 ? <p className="p-2 text-xs text-slate-500">No wallet refunds available.</p> : refunds.map((refund) => {
              const order = Array.isArray(refund.orders) ? refund.orders[0] : refund.orders;
              const item = Array.isArray(refund.order_items) ? refund.order_items[0] : refund.order_items;
              return <article key={refund.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 last:border-b-0">
                <div><p className="font-black">{refund.currency} {Number(refund.amount).toFixed(2)} · {item?.option_name ?? item?.product_name ?? "Product refund"}</p><p className="mt-1 text-xs text-slate-500">Order {order ? <Link href={`/account/orders/${order.id}`} className="font-bold text-cyan-700 underline underline-offset-2">{order.order_number}</Link> : ""} · Quantity {refund.quantity} · {formatDate(refund.created_at)}</p><p className="mt-2 text-sm text-slate-600">{refund.reason}</p></div>
                {refund.status === "PENDING_CLAIM" ? <form action={claimWalletRefund}><input type="hidden" name="refund_id" value={refund.id} /><button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500">Claim to wallet</button></form> : <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{refund.status.replaceAll("_", " ")}</span>}
              </article>;
            })}
          </div>
        </details>

        <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-bold">Top-up requests</summary>
          <div className="mt-2 overflow-hidden">
            {requests.length === 0 ? (
              <p className="p-2 text-xs text-slate-500">No wallet top-up requests yet.</p>
            ) : (
              requests.map((request) => (
                <article
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 last:border-b-0"
                >
                  <div>
                    <p className="font-black">{formatMoney(request.amount)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {request.payment_method.replaceAll("_", " ")} ·{" "}
                      {formatDate(request.created_at)}
                    </p>
                    {request.rejection_reason && (
                      <p className="mt-2 text-sm text-red-600">
                        {request.rejection_reason}
                      </p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    request.status === "EXPIRED"
                      ? "bg-slate-200 text-slate-600"
                      : request.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    {request.status}
                  </span>
                </article>
              ))
            )}
          </div>
        </details>

        <details id="transactions" open={page !== undefined} className="mt-3 scroll-mt-40 rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-bold">Wallet transactions</summary>
          <div className="mt-2 overflow-hidden">
            {transactions.length === 0 ? (
              <p className="p-2 text-xs text-slate-500">No wallet transactions yet.</p>
            ) : (
              transactions.map((transaction) => (
                <article
                  key={transaction.id}
                  className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-200 p-3 last:border-b-0"
                >
                  <div>
                    <p className="font-black">{transaction.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(transaction.created_at)} · Balance{" "}
                      {formatMoney(transaction.balance_after)}
                    </p>
                  </div>
                  <p
                    className={`font-black ${
                      transaction.transaction_type === "DEBIT"
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {transaction.transaction_type === "DEBIT" ? "−" : "+"}
                    {formatMoney(transaction.amount)}
                  </p>
                </article>
              ))
            )}
          </div>
          {transactionCount > 0 && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
            <p className="text-xs text-slate-500">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, transactionCount)} of {transactionCount}</p>
            <nav aria-label="Transaction pages" className="flex flex-wrap items-center gap-1">
              {currentPage > 1 && <Link className="grid min-h-10 min-w-8 place-items-center rounded-lg border border-slate-200 text-xs" href={`?page=${currentPage - 1}#transactions`} aria-label="Previous transaction page">‹</Link>}
              {pages.map((value, index) => <span key={value} className="flex items-center gap-1">
                {index > 0 && value - pages[index - 1] > 1 && <span>…</span>}
                <Link href={`?page=${value}#transactions`} aria-label={`Transaction page ${value}`} aria-current={value === currentPage ? "page" : undefined} className={`grid min-h-10 min-w-8 place-items-center rounded-lg border text-xs font-bold ${value === currentPage ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200"}`}>{value}</Link>
              </span>)}
              {currentPage < pageCount && <Link className="grid min-h-10 min-w-8 place-items-center rounded-lg border border-slate-200 text-xs" href={`?page=${currentPage + 1}#transactions`} aria-label="Next transaction page">›</Link>}
            </nav>
          </div>}
        </details>
      </div>
    </main>
  );
}
