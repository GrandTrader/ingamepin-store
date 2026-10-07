"use client";
import { useState } from "react";
import { loadOpenValueProducts } from "@/app/admin/definiteplay/open-value-actions";
import { filterOpenValueItems, formatOpenValueDiscount, type OpenValueItem } from "@/lib/definiteplay-open-value";

export default function RangeSupplierImport({ onImport }: { onImport: (item: OpenValueItem) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadOpenValueProducts>>["data"]>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [query, setQuery] = useState("");
  async function load() {
    setOpen(true); setBusy(true); setError("");
    try { const result = await loadOpenValueProducts(); setData(result.data); setError(result.error); }
    catch { setError("Unable to load supplier products. Try again."); }
    finally { setBusy(false); }
  }
  const items = data ? filterOpenValueItems(data.items, query, "", "") : [];
  return <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-bold">Import supplier range into this product</p><p className="mt-1 text-xs text-slate-600">Choose the matching product and region.</p></div>
      <button type="button" disabled={busy} onClick={() => data ? setOpen(!open) : load()} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-700 disabled:opacity-50">{busy ? "Loading supplier products…" : open ? "Close import" : "Import from Definite Play"}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {open && data && <div className="mt-3">
      <p className="text-xs text-slate-600">{data.preview ? "Local supplier export" : "Supplier catalogue"} · {new Date(data.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <p className="mt-1 text-xs text-slate-600">Import fills in the supplier settings. You set the markup before saving.</p>
      <input type="search" aria-label="Find supplier range" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Apple, Fortnite, Roblox or supplier code" className="my-3 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
      <div className="max-h-72 overflow-y-auto rounded-lg border bg-white">
        {items.map(item => <div key={item.sku} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 last:border-0">
          <div><p className="text-sm font-bold">{item.name} · {item.region}</p><p className="mt-1 text-xs text-slate-600">{item.minimum}–{item.maximum} {item.currency} · Step {item.increment} · {formatOpenValueDiscount(item.discountPercent)} · {item.sku}</p></div>
          <button type="button" onClick={() => { onImport(item); setOpen(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Use this range</button>
        </div>)}
        {!items.length && <p className="p-4 text-sm text-slate-600">No matching supplier products.</p>}
      </div>
    </div>}
  </div>;
}
