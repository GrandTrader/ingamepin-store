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
  searchParams: Promise<{ error?: string; success?: string }>;
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
  const { error, success } = await searchParams;
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
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
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
  const requests = requestResult.data ?? [];
  const refunds = refundResult.data ?? [];
  const gateways = getWalletPaymentGateways();
  const walletEnabled = user.app_metadata?.wallet_disabled !== true;

  return (
    <main className="bg-slate-100 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/account/dashboard"
          className="text-sm font-bold text-cyan-700"
        >
          ← Return to dashboard
        </Link>

        <div className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
          <section className="bg-cyan-50 p-7 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
              InGamePin Wallet
            </p>
            <p className="mt-7 text-sm text-slate-500">Available balance</p>
            <p className="mt-2 text-4xl font-black text-cyan-700">
              {formatMoney(wallet.balance)}
            </p>
            <div className="mt-8 rounded-2xl bg-white p-5">
              <h2 className="font-black">USD wallet</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Add money through any available payment gateway. Your balance
                is credited automatically after verified payment.
              </p>
            </div>
          </section>

          <section className="p-7 sm:p-9">
            <h1 className="text-3xl font-black">Add money</h1>
            <p className="mt-2 text-slate-500">
              Choose an amount and pay using any available gateway.
            </p>

            {error && (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
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

        <section className="mt-8">
          <h2 className="text-2xl font-black">Approved refunds</h2>
          <p className="mt-1 text-sm text-slate-500">Refunds approved for your verified account email.</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {refunds.length === 0 ? <p className="p-6 text-slate-500">No wallet refunds available.</p> : refunds.map((refund) => {
              const order = Array.isArray(refund.orders) ? refund.orders[0] : refund.orders;
              const item = Array.isArray(refund.order_items) ? refund.order_items[0] : refund.order_items;
              return <article key={refund.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 last:border-b-0">
                <div><p className="font-black">{refund.currency} {Number(refund.amount).toFixed(2)} · {item?.option_name ?? item?.product_name ?? "Product refund"}</p><p className="mt-1 text-xs text-slate-500">Order {order ? <Link href={`/account/orders/${order.id}`} className="font-bold text-cyan-700 underline underline-offset-2">{order.order_number}</Link> : ""} · Quantity {refund.quantity} · {formatDate(refund.created_at)}</p><p className="mt-2 text-sm text-slate-600">{refund.reason}</p></div>
                {refund.status === "PENDING_CLAIM" ? <form action={claimWalletRefund}><input type="hidden" name="refund_id" value={refund.id} /><button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500">Claim to wallet</button></form> : <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{refund.status.replaceAll("_", " ")}</span>}
              </article>;
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-black">Top-up requests</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {requests.length === 0 ? (
              <p className="p-6 text-slate-500">No wallet top-up requests yet.</p>
            ) : (
              requests.map((request) => (
                <article
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 last:border-b-0"
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
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-black">Wallet transactions</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {transactions.length === 0 ? (
              <p className="p-6 text-slate-500">No wallet transactions yet.</p>
            ) : (
              transactions.map((transaction) => (
                <article
                  key={transaction.id}
                  className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-200 p-5 last:border-b-0"
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
        </section>
      </div>
    </main>
  );
}
