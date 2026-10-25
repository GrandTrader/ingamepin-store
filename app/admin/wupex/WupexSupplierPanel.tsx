"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { configureWupexDelivery, refreshWupexProduct, saveWupexMarkup } from "./delivery-actions";
import type { getWupexProductImport } from "@/lib/wupex-product-supplier";
type Imported = NonNullable<Awaited<ReturnType<typeof getWupexProductImport>>>;
export default function WupexSupplierPanel({ imported, enabled }: { imported: Imported; enabled: boolean }) {
 const router = useRouter();
 const [markup, setMarkup] = useState(String(imported.markup_percent));
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
 async function act(action: () => Promise<{ error?: string; success?: boolean }>) {
  if (busy) return; setBusy(true); setError(""); setMessage("");
  try { const result = await action(); if (result.error) setError(result.error); else { setMessage("Saved."); router.refresh(); } }
  catch { setError("Unable to finish. Refresh to check the saved settings."); }
  finally { setBusy(false); }
 }
 return <div className="mt-5 space-y-4">
 {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
 {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
 <section className="rounded-xl border bg-blue-50 p-4"><h2 className="text-lg font-black">Wupex automatic delivery</h2><p className="mt-2 text-sm">{enabled ? "Enabled. Purchases are sent after verified customer payment." : "Disabled. Enable after connecting your live Wupex account."}</p>
 <button disabled={busy} onClick={() => void act(() => configureWupexDelivery(imported.product_id, !enabled))} className="mt-3 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{enabled ? "Disable automatic delivery" : "Enable automatic delivery"}</button>
 </section>
 <section className="rounded-xl border p-4"><h2 className="font-black">Automatic pricing</h2><p className="mt-2 text-sm text-slate-600">Supplier costs and selling prices refresh using this markup. Existing orders keep their original prices.</p>
 <form onSubmit={e => { e.preventDefault(); void act(() => saveWupexMarkup(imported.product_id, markup)); }} className="mt-3 flex flex-wrap items-end gap-2">
 <label className="text-sm">Markup (%)<input type="number" min="0" max="1000" step="0.01" required value={markup} onChange={e => setMarkup(e.target.value)} className="mt-1 block w-32 rounded-lg border px-3 py-2.5"/></label>
 <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Save markup</button>
 <button type="button" disabled={busy} onClick={() => void act(() => refreshWupexProduct(imported.product_id))} className="rounded-lg border px-4 py-2.5 text-sm font-bold disabled:opacity-50">Refresh prices & stock</button>
 </form></section>
 <section className="rounded-xl border p-4"><h2 className="font-black">Linked denominations</h2>{imported.links.map(l => <div key={l.optionId} className="mt-3 border-t pt-3 text-sm"><p className="break-words font-bold">{l.name}</p><p className="mt-1 break-all text-slate-500">{l.sku}</p><p className="mt-1">Supplier cost: USD {l.cost}</p></div>)}</section>
 {!!imported.jobs.length && <section className="rounded-xl border p-4"><h2 className="font-black">Recent supplier deliveries</h2>{imported.jobs.map(j => <div key={j.item_id} className="mt-3 border-t pt-3 text-sm"><p className="font-bold">{j.state}</p>{j.issue && <p className="mt-1 text-amber-800">{j.issue}</p>}<Link href={"/admin/orders/" + j.order_id + "/receipt"} className="mt-2 inline-block text-blue-700 underline">View order</Link></div>)}</section>}
 </div>;
}
