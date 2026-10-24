"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import AccountReturnField from "@/components/AccountReturnField";
import { WITHDRAWAL_NETWORKS, withdrawalQuote, validWithdrawalAddress } from "@/lib/wallet-withdrawals";
import { requestWithdrawal } from "./withdrawal-actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} className="min-h-11 w-full rounded-xl bg-cyan-700 px-4 py-3 font-bold text-white disabled:opacity-50">{pending ? "Submitting request…" : "Confirm withdrawal request"}</button>;
}
export default function WithdrawalForm({ balance, requestKey }: { balance: number; requestKey: string }) {
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("TRC20");
  const [address, setAddress] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const quote = withdrawalQuote(amount, network);
  const valid = quote.valid && quote.amount <= balance && validWithdrawalAddress(network, address);
  const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 text-slate-950";
  return <form action={requestWithdrawal} className="mt-4 space-y-4">
    <AccountReturnField area="wallet" />
    <input type="hidden" name="request_key" value={requestKey} />
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">Amount from wallet (USD)<input name="amount" inputMode="decimal" required autoComplete="off" value={amount} onChange={event => { setAmount(event.target.value); setConfirmed(false); }} placeholder="100.00" className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Available: {"$"}{balance.toFixed(2)}</span></label>
      <label className="text-sm font-bold">USDT network<select name="network" value={network} onChange={event => { setNetwork(event.target.value); setConfirmed(false); }} className={field}>{WITHDRAWAL_NETWORKS.map(item => <option key={item.value} value={item.value}>{item.label} · {"$"}{item.fee.toFixed(2)} fee</option>)}</select></label>
    </div>
    <label className="block text-sm font-bold">Receiving USDT wallet address<input name="wallet_address" required maxLength={100} autoComplete="off" spellCheck={false} value={address} onChange={event => { setAddress(event.target.value); setConfirmed(false); }} className={field + " font-mono text-xs"} /></label>
    {address && !validWithdrawalAddress(network, address) && <p className="text-sm text-red-700">Check the address format for this network.</p>}
    {amount && !quote.valid && <p className="text-sm text-red-700">Enter an amount above the fee, with at most two decimal places.</p>}
    {quote.amount > balance && <p className="text-sm text-red-700">Amount exceeds your available balance.</p>}
    <div aria-live="polite" className="rounded-xl bg-cyan-50 p-4 text-sm text-slate-900">
      <div className="flex justify-between gap-3"><span>Amount reserved</span><strong>{"$"}{quote.amount.toFixed(2)}</strong></div>
      <div className="mt-2 flex justify-between gap-3"><span>Fixed network fee</span><strong>−{"$"}{quote.fee.toFixed(2)}</strong></div>
      <div className="mt-3 flex justify-between gap-3 border-t border-cyan-200 pt-3"><span>You receive</span><strong>{quote.net.toFixed(2)} USDT</strong></div>
      <p className="mt-2 text-xs text-slate-600">USD 1 = USDT 1. This is a fixed fee, not a live gas estimate.</p>
    </div>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" value="yes" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0" /><span>I confirm the amount, fee, network and wallet address. My receiving wallet supports USDT on this network.</span></label>
    <p className="text-xs text-slate-500">The full amount is reserved immediately. You can cancel before approval. If rejected or cancelled, the full amount is released.</p>
    <Submit disabled={!valid || !confirmed} />
  </form>;
}
