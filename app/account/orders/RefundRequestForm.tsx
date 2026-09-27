"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPaymentMethod } from "@/lib/payment-method-label";
import { requestOrderRefund } from "./refund-actions";

export default function RefundRequestForm({ orderId, methods, originalMethod, amount, currency }: { orderId: string; methods: string[]; originalMethod: string; amount: number; currency: string }) {
  const [method, setMethod] = useState(methods.includes("WALLET") ? "WALLET" : originalMethod);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm";
  if (submitted) return <p role="status" className="rounded-xl bg-blue-50 p-4">Refund request submitted. Delivery is paused while the admin reviews it.</p>;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">Request a refund</summary>
    <form className="mt-4 space-y-4" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      startTransition(async () => { try { const result = await requestOrderRefund(form); if (result.error) setError(result.error); else { setSubmitted(true); router.refresh(); } } catch { setError("Unable to confirm your request. Reload the order before trying again."); } });
    }}>
      <fieldset disabled={pending} className="space-y-4">
        <input type="hidden" name="order_id" value={orderId} />
        <p className="text-sm">Request a full refund of <strong>{currency} {amount.toFixed(2)}</strong>. Delivery will pause for admin review. The order is cancelled after the refund is completed.</p>
        <label className="block text-sm font-bold">Refund method<select name="method" value={method} onChange={e => setMethod(e.target.value)} className={field}>{methods.map(value => <option key={value} value={value}>{formatPaymentMethod(value)}{value === originalMethod ? " (original payment method)" : ""}</option>)}</select></label>
        <p className="text-sm text-slate-600">{method === "WALLET" ? "The admin can credit your InGamePIN wallet upon approval." : "The admin will arrange the refund transfer after approval. Approval alone does not mean the money has been sent."}</p>
        {method !== "WALLET" && <label className="block text-sm font-bold">Receiving account or wallet details<textarea name="details" maxLength={1000} minLength={3} required={method !== originalMethod} rows={3} className={field} placeholder={method === "USDT_DIRECT" ? "USDT network and wallet address" : method === originalMethod ? "Optional if returning to the original payment account" : "Account identifier, UPI ID, or wallet address and network"} /><span className="text-xs font-normal text-slate-500">Do not enter passwords, OTPs, private keys or card security codes.</span></label>}
        <label className="block text-sm font-bold">Reason<textarea name="reason" required minLength={3} maxLength={1000} rows={3} className={field} /></label>
        <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={pending}>{pending ? "Submitting…" : "Submit refund request"}</button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  </details>;
}
