"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { configureGiftPortDelivery, saveGiftPortRecipient } from "./fulfillment-actions";
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
export default function GiftPortDeliveryControl({productId, enabled, locked}: {productId: string; enabled: boolean; locked: boolean}) {
  const [pending, start] = useTransition(); const [message, setMessage] = useState(""); const router = useRouter();
  return <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"><h2 className="font-bold">GiftPort automatic delivery {enabled ? "— enabled" : "— disabled"}</h2>
    <p className="mt-2 text-sm">Verified paid orders are purchased one card at a time. Codes appear on the customer’s order page after every card is confirmed.</p>
    <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e => {e.preventDefault(); const data = new FormData(e.currentTarget); start(async () => {const result = await configureGiftPortDelivery(productId, !enabled, data); setMessage(result.error ?? (enabled ? "Automatic delivery disabled." : "Enabled. Availability updates after the next supplier check.")); if (result.success) router.refresh();});}}>
      {!enabled && <><label className="text-sm">Supplier cost budget per 100 INR (USD)<input name="budget" type="number" min="0.00000001" max="10000" step="0.00000001" required className={input}/></label>
      <label className="text-sm">Maximum cards per option per order<input name="limit" type="number" min="1" max="100" defaultValue="10" required className={input}/></label>
      <p className="text-xs text-slate-600 sm:col-span-2">GiftPort does not report wholesale cost or stock counts. Set a conservative USD cost budget including fees and conversion. Availability is limited by your purchase limit and the supplier wallet; supply is confirmed when ordering.</p>
      <label className="text-sm sm:col-span-2"><input type="checkbox" name="confirmed" required className="mr-2"/>I checked the cost budget, including fees.</label></>}
      <div className="sm:col-span-2"><button className={button} disabled={pending || locked}>{pending ? "Saving…" : enabled ? "Use uploaded stock instead" : "Enable GiftPort delivery"}</button></div>
    </form>{message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>;
}
