"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPaymentMethod } from "@/lib/payment-method-label";
import { CRYPTO_REFUND_NETWORKS, refundQuote } from "@/lib/order-refund-request";
import { requestOrderRefund } from "./refund-actions";

export default function RefundRequestForm({ orderId, methods, originalMethod, amount, currency }: { orderId: string; methods: string[]; originalMethod: string; amount: number; currency: string }) {
  const [method, setMethod] = useState(methods.includes("WALLET") ? "WALLET" : originalMethod);
  const [network, setNetwork] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const quote = refundQuote(amount, currency, method, network);
  const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm";
  if (submitted) return <p role="status" className="rounded-xl bg-blue-50 p-4">Refund request submitted. Delivery is paused while the admin reviews it.</p>;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">Request a refund</summary>
    <form className="mt-4 space-y-4" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      startTransition(async () => { try { const result = await requestOrderRefund(form); if (result.error) setError(result.error); else { setSubmitted(true); router.refresh(); } } catch { setError("Unable to confirm your request. Reload the order before trying again."); } });
    }}>
      <fieldset disabled={pending} className="space-y-4">
        <input type="hidden" name="order_id" value={orderId} />
        <p className="text-sm">Request a refund for your order of <strong>{currency} {amount.toFixed(2)}</strong>. Delivery will pause for admin review. The order is cancelled after the refund is completed.</p>
        <label className="block text-sm font-bold">Refund method<select name="method" value={method} onChange={e => setMethod(e.target.value)} className={field}>{methods.map(value => <option key={value} value={value}>{formatPaymentMethod(value)}{value === originalMethod ? " (original payment method)" : ""}</option>)}</select></label>
        <p className="text-sm text-slate-600">{method === "WALLET" ? "The admin can credit your InGamePIN wallet upon approval." : "The admin will arrange the refund transfer after approval. Approval alone does not mean the money has been sent."}</p>
        {method === "USDT_DIRECT" ? <div className="max-w-2xl space-y-2">
          <div className="grid gap-3 sm:grid-cols-[210px_minmax(0,1fr)]">
            <label className="block text-sm font-bold">Refund network<select name="network" required value={network} onChange={event => setNetwork(event.target.value)} className={field}>
              <option value="" disabled>Select network</option>
              {CRYPTO_REFUND_NETWORKS.map(network => <option key={network.value} value={network.value}>{network.label} — ${network.feeUsd.toFixed(2)} fee</option>)}
            </select></label>
            <label className="block min-w-0 text-sm font-bold">USDT wallet address<input name="wallet_address" required maxLength={150} autoComplete="off" autoCapitalize="none" spellCheck={false} className={field} placeholder="Receiving wallet address" /></label>
          </div>
          {network === "OTHER" && <label className="block max-w-sm text-sm font-bold">Network name<input name="other_network" required minLength={2} maxLength={60} className={field} placeholder="For example: Ethereum (ERC20)" /></label>}
          <p className="text-xs text-slate-500">Select the network supported by your receiving USDT wallet. The network and address will be saved with your refund request.</p>
        </div> : method !== "WALLET" && <label className="block max-w-lg text-sm font-bold">Receiving account details<input name="details" maxLength={1000} minLength={3} required={method !== originalMethod} className={field} placeholder={method === originalMethod ? "Optional for the original payment account" : "Account identifier or UPI ID"} /><span className="text-xs font-normal text-slate-500">Do not enter passwords, OTPs or card security codes.</span></label>}
        <div aria-live="polite" className="max-w-2xl rounded-xl bg-slate-50 p-3 text-sm">
          {quote.error ? <p className="text-amber-800">{quote.error}</p> : <>
            <p>Order amount: {currency} {amount.toFixed(2)}</p>
            <p>Network fee / commission: {currency} {quote.fee.toFixed(2)}{quote.fee === 0 ? " (no commission)" : " (deducted from your refund)"}</p>
            <p className="mt-1 font-bold">You receive: {currency} {quote.net.toFixed(2)}</p>
          </>}
        </div>
        <label className="block text-sm font-bold">Reason<textarea name="reason" required minLength={3} maxLength={1000} rows={3} className={field} /></label>
        <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={pending || Boolean(quote.error)}>{pending ? "Submitting…" : "Submit refund request"}</button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  </details>;
}
