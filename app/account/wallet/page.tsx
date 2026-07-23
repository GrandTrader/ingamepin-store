import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { startBinanceWalletTopup, submitWalletTopup } from "./actions";
import CopyUpiButton from "./CopyUpiButton";

export const dynamic = "force-dynamic";
type WalletPageProps = { searchParams: Promise<{ error?: string; success?: string }> };

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export default async function CustomerWalletPage({ searchParams }: WalletPageProps) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/account?error=Please sign in to continue.");

  const [walletResult, transactionResult, requestResult] = await Promise.all([
    supabase.from("customer_wallets").select("balance, currency").eq("user_id", user.id).maybeSingle(),
    supabase.from("wallet_transactions").select("id, transaction_type, amount, balance_after, description, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
    supabase.from("wallet_topup_requests").select("id, amount, payment_method, payment_reference, status, rejection_reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const wallet = walletResult.data ?? { balance: 0, currency: "INR" };
  const transactions = transactionResult.data ?? [];
  const requests = requestResult.data ?? [];
  const hasPendingRequest = requests.some((request) => request.status === "PENDING");

  return (
    <main className="bg-slate-100 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <Link href="/account/dashboard" className="text-sm font-bold text-cyan-700">← Return to dashboard</Link>
        <div className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
          <section className="bg-cyan-50 p-7 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">InGamePin Wallet</p>
            <p className="mt-7 text-sm text-slate-500">Available balance</p>
            <p className="mt-2 text-4xl font-black text-cyan-700">{formatMoney(wallet.balance)}</p>
            <div className="mt-8 rounded-2xl bg-white p-5">
              <h2 className="font-black">Pay using UPI</h2>
              <div className="mt-4 flex justify-center"><Image src="/images/upi-qr.jpeg" alt="InGamePin UPI payment QR code" width={190} height={190} className="rounded-xl border border-slate-200" /></div>
              <p className="mt-4 text-center text-sm text-slate-500">UPI ID</p><p className="mt-1 break-all text-center font-black">AGAMAN315@iob</p>
              <CopyUpiButton />
            </div>
          </section>
          <section className="p-7 sm:p-9">
            <h1 className="text-3xl font-black">Add money</h1><p className="mt-2 text-slate-500">Pay the exact amount by UPI, then submit its transaction reference.</p>
            {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
            {success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</p>}
            {hasPendingRequest ? <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800"><p className="font-black">Top-up pending</p><p className="mt-2 text-sm">Complete or wait for your existing wallet top-up before starting another.</p></div> : <div className="mt-7 space-y-6">
              <form action={startBinanceWalletTopup} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Automatic payment</p>
                <h2 className="mt-2 text-xl font-black">Pay with Binance Pay</h2>
                <p className="mt-1 text-sm text-slate-600">Your wallet is credited automatically after Binance confirms payment.</p>
                <label className="mt-5 block text-sm font-bold">Amount (INR)<input name="amount" type="number" min="10" max="100000" step="0.01" required placeholder="500" className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 outline-none focus:border-amber-500" /></label>
                <button type="submit" className="mt-5 w-full rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950">Continue to Binance Pay</button>
              </form>
              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-400"><span className="h-px flex-1 bg-slate-200" />Or use UPI<span className="h-px flex-1 bg-slate-200" /></div>
              <form action={submitWalletTopup} className="space-y-5 rounded-2xl border border-slate-200 p-5">
                <label className="block text-sm font-bold">Amount (INR)<input name="amount" type="number" min="10" max="100000" step="0.01" required placeholder="500" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500" /></label>
                <label className="block text-sm font-bold">UPI transaction / UTR number<input name="payment_reference" required minLength={4} maxLength={150} placeholder="Enter payment reference" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500" /></label>
                <button type="submit" className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950">Submit UPI for verification</button>
              </form>
            </div>}
          </section>
        </div>
        <section className="mt-8"><h2 className="text-2xl font-black">Top-up requests</h2><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{requests.length === 0 ? <p className="p-6 text-slate-500">No wallet top-up requests yet.</p> : requests.map((request) => <article key={request.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 last:border-b-0"><div><p className="font-black">{formatMoney(request.amount)}</p><p className="mt-1 text-xs text-slate-500">Reference: {request.payment_reference} · {formatDate(request.created_at)}</p>{request.rejection_reason && <p className="mt-2 text-sm text-red-600">{request.rejection_reason}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${request.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : request.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{request.status}</span></article>)}</div></section>
        <section className="mt-8"><h2 className="text-2xl font-black">Wallet transactions</h2><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{transactions.length === 0 ? <p className="p-6 text-slate-500">No wallet transactions yet.</p> : transactions.map((transaction) => <article key={transaction.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-200 p-5 last:border-b-0"><div><p className="font-black">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{formatDate(transaction.created_at)} · Balance {formatMoney(transaction.balance_after)}</p></div><p className={`font-black ${transaction.transaction_type === "DEBIT" ? "text-red-600" : "text-emerald-600"}`}>{transaction.transaction_type === "DEBIT" ? "−" : "+"}{formatMoney(transaction.amount)}</p></article>)}</div></section>
      </div>
    </main>
  );
}
