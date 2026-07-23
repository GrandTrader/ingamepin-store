import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import BinanceWalletButton from "./BinanceWalletButton";

export const dynamic = "force-dynamic";

export default async function BinanceWalletTopupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account?error=Please sign in to continue.");

  const result = await supabase
    .from("wallet_topup_requests")
    .select("id, amount, currency, payment_method, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const request = result.data;

  if (!request || request.payment_method !== "BINANCE_PAY") notFound();
  if (request.status !== "PENDING") redirect("/account/wallet");

  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: request.currency,
  }).format(Number(request.amount));

  return (
    <main className="bg-slate-100 px-4 py-16 text-slate-950">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-9">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-600">Binance Pay</p>
        <h1 className="mt-3 text-3xl font-black">Add money to your wallet</h1>
        <p className="mt-3 text-slate-500">Binance calculates the supported cryptocurrency amount from your USD top-up.</p>
        <div className="my-7 rounded-2xl bg-slate-950 p-6 text-white">
          <p className="text-sm text-slate-400">Wallet top-up</p>
          <p className="mt-2 text-4xl font-black text-cyan-400">{amount}</p>
        </div>
        <BinanceWalletButton requestId={request.id} />
        <Link href="/account/wallet" className="mt-5 block text-sm font-bold text-slate-500">Cancel and return to wallet</Link>
      </div>
    </main>
  );
}
