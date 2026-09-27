"use client";
import Link from "next/link";
import { useState } from "react";
import type { GiftPortItem } from "@/lib/giftport-types";

export default function GiftPortCatalogue({ items, stale }: { items: GiftPortItem[]; stale: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [delivery, setDelivery] = useState("");
  const [page, setPage] = useState(1);
  const categories = [...new Set(items.flatMap(i => (i.category || "").split(",").map(c => c.trim()).filter(Boolean)))].sort();
  const countries = [...new Set(items.map(i => i.country).filter((c): c is string => !!c))].sort();
  const realtime = (i: GiftPortItem) => /^real\s*time$/i.test(i.deliveryType || "");
  const filtered = items.filter(i => `${i.brandName} ${i.operatorCode}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!category || (i.category || "").split(",").map(c => c.trim()).includes(category)) &&
    (!country || i.country === country) && (!delivery || (delivery === "realtime" ? realtime(i) : !realtime(i))));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const current = Math.min(page, pages);
  const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal";
  return <section className="rounded-2xl border p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Supplier catalogue</h2><Link href="/admin/products" className="font-semibold text-blue-700">Website products →</Link></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-bold">Search<input className={field} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Brand name or operator code" /></label>
      <label className="text-sm font-bold">Category<select className={field} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm font-bold">Country<select className={field} value={country} onChange={e => { setCountry(e.target.value); setPage(1); }}><option value="">All countries</option>{countries.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm font-bold">Supplier delivery<select className={field} value={delivery} onChange={e => { setDelivery(e.target.value); setPage(1); }}><option value="">All delivery types</option><option value="realtime">Realtime</option><option value="processing">Processing / other</option></select></label>
    </div>
    <p className="mt-4 text-sm text-slate-600">{filtered.length} matching brands. Import a brand to select its denominations and set your USD selling prices.</p>
    <p className="mt-2 text-xs text-slate-500">Face values are in the supplier currency. GiftPort does not provide wholesale costs or stock quantities in this catalogue.</p>
    {stale && <p className="mt-3 text-sm text-amber-800">Refresh the catalogue before importing.</p>}
    <div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Product", "Region / values", "Supplier delivery", "Import"].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>
      {filtered.slice((current - 1) * 30, current * 30).map(item => <tr key={item.operatorCode} className="border-t align-top">
        <td className="min-w-56 p-3"><p className="font-semibold">{item.brandName}</p><p className="mt-1 text-xs text-slate-500">{item.operatorCode} · {item.category || "Uncategorised"}</p></td>
        <td className="min-w-64 p-3"><p>{item.country || "Country unconfirmed"} · {item.currency || "Currency unconfirmed"}</p><p className="mt-1 max-w-lg">{item.denominations.join(", ") || "Fixed values unconfirmed"}</p>{item.variable === true && <p className="mt-2 text-xs text-blue-700">{item.variableRange ? `Variable: ${item.variableRange.min}–${item.variableRange.max} ${item.currency}` : "Variable range unconfirmed"}</p>}{item.denominationsIncomplete && <p className="mt-1 text-xs text-amber-800">Fixed values require supplier confirmation.</p>}</td>
        <td className="p-3">{item.deliveryType || "Not confirmed"}<p className="mt-1 text-xs text-slate-500">Stock not supplied</p></td>
        <td className="p-3">{!stale && item.currency === "INR" && (item.denominations.length > 0 || item.variableRange) ? <Link href={`/admin/giftport/import?code=${encodeURIComponent(item.operatorCode)}`} className="inline-block whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Import brand</Link> : <span className="text-xs text-slate-500">{stale ? "Refresh first" : "Values unconfirmed"}</span>}</td>
      </tr>)}
    </tbody></table>{!filtered.length && <p className="p-5 text-slate-500">No matching brands.</p>}</div>
    <nav aria-label="GiftPort catalogue pages" className="mt-5 flex items-center justify-between gap-4"><button disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">← Previous</button><span className="text-sm">Page {current} of {pages}</span><button disabled={current >= pages} onClick={() => setPage(current + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Next →</button></nav>
  </section>;
}
