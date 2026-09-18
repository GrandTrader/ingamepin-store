"use client";

import { useFormStatus } from "react-dom";
import { recordManualRefund } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pending ? "Saving refund…" : "Mark manually refunded"}</button>;
}

export default function ManualRefundForm({ orderId, itemId, quantity, maxAmount, currency }: {
  orderId: string; itemId: string; quantity: number; maxAmount: number; currency: string;
}) {
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <details className="mt-3 rounded-lg border border-slate-300 bg-white p-3 text-slate-900">
    <summary className="cursor-pointer text-sm font-bold">Record manual refund</summary>
    <form action={recordManualRefund} className="mt-3 grid gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="item_id" value={itemId} />
      <p className="text-xs text-slate-600">Use only after you have returned the money. This records the refund and does not send or credit money.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold">Quantity<input name="quantity" type="number" min="1" max={quantity} defaultValue={quantity} required className={inputClass} /></label>
        <label className="text-xs font-bold">Amount ({currency})<input name="amount" type="number" min="0.01" max={maxAmount.toFixed(2)} step="0.01" inputMode="decimal" placeholder="0.00" required className={inputClass} /></label>
      </div>
      <label className="text-xs font-bold">Refunded to<select name="refund_destination" required className={inputClass}><option value="">Select destination</option><option value="WALLET">Customer wallet (already credited)</option><option value="PAYMENT_METHOD">Payment method (already refunded)</option></select></label>
      <label className="text-xs font-bold">Refund transaction ID<input name="transaction_id" minLength={3} maxLength={200} autoComplete="off" required className={inputClass} /></label>
      <label className="text-xs font-bold">Reason<input name="reason" minLength={3} maxLength={500} required className={inputClass} /></label>
      <label className="flex items-start gap-2 text-xs"><input name="refund_confirmed" type="checkbox" required className="mt-0.5" />I confirm the customer has already received this refund.</label>
      <SaveButton />
    </form>
  </details>;
}
