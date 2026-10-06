"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { configureGiftPortDelivery, saveGiftPortRecipient, saveGiftPortPricing } from "./fulfillment-actions";
import { giftPortCostPreview } from "@/lib/giftport-pricing";
const input = "mt-1 w-full rounded-lg border bg-white px-3 py-2";
const button = "rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50";
export type BusinessRecipient = {recipient_name: string; recipient_email: string; mobile: string};
export function GiftPortRecipientForm({recipient}: {recipient: BusinessRecipient | null}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return <details className="rounded-xl border p-4" open={!recipient}><summary className="cursor-pointer font-bold">Business recipient for GiftPort orders</summary>
    <p className="mt-2 text-sm text-slate-600">GiftPort receives these business details. Customers receive their codes through InGamePin. Changes apply to new orders.</p>
    <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={e => {e.preventDefault(); const data = new FormData(e.currentTarget); start(async () => {const result = await saveGiftPortRecipient(data); setMessage(result.error ?? "Business recipient saved.");});}}>
      <label className="text-sm">Business recipient name<input name="name" required maxLength={150} defaultValue={recipient?.recipient_name} className={input}/></label>
      <label className="text-sm">Business email<input name="email" type="email" required maxLength={254} defaultValue={recipient?.recipient_email} className={input}/></label>
      <label className="text-sm">Business mobile<input name="mobile" inputMode="numeric" pattern="[0-9]{10,15}" required defaultValue={recipient?.mobile} className={input}/></label>
      <div className="sm:col-span-3"><button disabled={pending} className={button}>{pending ? "Saving…" : "Save business details"}</button></div>
    </form>{message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </details>;
}
export default function GiftPortDeliveryControl({productId, enabled, locked, rate, discount, purchaseLimit, pricingReady}: {
  productId: string; enabled: boolean; locked: boolean; rate: number | null;
  discount: number | null; purchaseLimit: number; pricingReady: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [percent, setPercent] = useState(String(discount ?? 0));
  const router = useRouter();
  let preview: {inr: number; usd: number} | null = null;
  try { preview = giftPortCostPreview(100, percent, rate); } catch { /* Invalid input is shown by form validation. */ }
  const canSave = pricingReady && preview !== null && !locked && !pending;
  function save(data: FormData, activate: boolean) {
    start(async () => {
      const result = activate ? await configureGiftPortDelivery(productId, true, data) : await saveGiftPortPricing(productId, data);
      setMessage(result.error ?? (activate ? "Enabled. Availability updates after the next supplier check." : "Supplier discount saved. Costs use your website INR exchange rate."));
      if (result.success) router.refresh();
    });
  }
  return <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"><h2 className="font-bold">GiftPort automatic delivery {enabled ? "— enabled" : "— disabled"}</h2>
    <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e => {e.preventDefault(); save(new FormData(e.currentTarget), !enabled);}}>
      <label className="text-sm">Supplier discount (%)<input name="discount" type="number" min="0" max="99.99" step="0.01" value={percent} onChange={e => setPercent(e.target.value)} required className={input}/><span className="mt-1 block text-xs text-slate-600">Enter 0 if you pay full face value.</span></label>
      <label className="text-sm">Maximum cards per option per order<input name="limit" type="number" min="1" max="100" defaultValue={purchaseLimit} required className={input}/></label>
      <div aria-live="polite" className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm sm:col-span-2">
        {preview && rate !== null ? <><p>For a ₹100 card: <strong>₹{preview.inr.toFixed(2)} → ${preview.usd.toFixed(8)}</strong></p><p className="mt-1 text-xs text-slate-500">Website rate: $1 = ₹{rate}. Costs update automatically when this rate changes.</p></> : <p className="text-amber-800">Enter a valid discount and save an INR exchange rate in Payment Settings.</p>}
      </div>
      <p className="text-xs text-slate-600 sm:col-span-2">This calculates your supplier purchase cost. Your customer selling prices stay as set in Product options.</p>
      {!pricingReady && <p role="alert" className="text-sm text-amber-800 sm:col-span-2">The supplier discount database update is required before saving.</p>}
      {enabled && discount === null && <p className="text-xs text-amber-800 sm:col-span-2">Save your discount to switch this product from its previous cost budget to automatic calculation.</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className={button} disabled={!canSave}>{pending ? "Saving…" : enabled ? "Save supplier settings" : "Enable GiftPort delivery"}</button>
        {!enabled && <button type="button" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!canSave} onClick={e => {const form = e.currentTarget.form; if (form?.reportValidity()) save(new FormData(form), false);}}>Save discount only</button>}
        {enabled && <button type="button" disabled={pending || locked} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => start(async () => {const result = await configureGiftPortDelivery(productId, false, new FormData()); setMessage(result.error ?? "Automatic delivery disabled."); if (result.success) router.refresh();})}>Use uploaded stock instead</button>}
      </div>
    </form>{message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>;
}
