"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { searchInventoryCodes } from "./code-search-actions";

type Results = Awaited<ReturnType<typeof searchInventoryCodes>>;
function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
const labels: Record<string, string> = { AVAILABLE: "Unsold", SOLD: "Sold", RESERVED: "Reserved", DISABLED: "Disabled" };

export default function CodeSearch() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(value: string, page: number) {
    setBusy(true); setError("");
    try { const result = await searchInventoryCodes(value, page); setResults(result); setSearched(value); }
    catch (e) { setResults(null); setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); void search(query.trim(), 1);
  }
  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="code-search-heading">
    <h2 id="code-search-heading" className="text-base font-black">Search codes and vouchers</h2>
    <p className="mt-1 text-sm text-slate-500">Search all products, including sold, unsold, reserved and disabled codes.</p>
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="inventory-code-search">Code or voucher</label>
      <input id="inventory-code-search" type="search" value={query} onChange={e => setQuery(e.target.value)} required maxLength={500} autoComplete="off" spellCheck={false} placeholder="Enter a code, voucher, or part of one" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base" />
      <button disabled={busy || !query.trim()} className="min-h-11 rounded-lg bg-blue-600 px-5 font-bold text-white disabled:opacity-50">{busy ? "Searching…" : "Search codes"}</button>
      {(results || error) && <button type="button" disabled={busy} onClick={() => { setQuery(""); setSearched(""); setResults(null); setError(""); }} className="min-h-11 rounded-lg border border-slate-300 px-4 font-bold">Clear</button>}
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {results && <div className="mt-4" aria-busy={busy}>
      <p role="status" className="text-sm font-bold">{results.total} matching codes{results.total === 0 ? ". Try another code or a shorter part of it." : ""}</p>
      {results.rows.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b bg-slate-50"><th className="p-3">Code / voucher</th><th className="p-3">Product</th><th className="p-3">Option / value</th><th className="p-3">Status</th><th className="p-3">Sold date</th></tr></thead>
        <tbody>{results.rows.map(row => { const product = first(row.products); const option = first(row.product_options); return <tr key={row.id} className="border-b align-top">
          <td className="min-w-48 max-w-sm break-all p-3 font-mono select-all">{row.code}</td>
          <td className="min-w-44 p-3"><Link className="font-bold text-blue-600 underline" href={"/admin/products/" + row.product_id + "/edit/stock"}>{product?.name ?? "Unknown product"}</Link><span className="block text-xs text-slate-500">ID {product?.public_id ?? "—"}</span></td>
          <td className="p-3">{option?.option_name ?? row.denomination ?? "—"}</td>
          <td className="p-3 font-bold">{labels[row.status] ?? row.status}</td>
          <td className="whitespace-nowrap p-3">{row.sold_at ? new Date(row.sold_at).toLocaleString() : "—"}</td>
        </tr>; })}</tbody>
      </table></div>}
      {results.total > 50 && <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" disabled={busy || results.page <= 1} onClick={() => void search(searched, results.page - 1)} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">Previous</button>
        <span className="text-sm">Page {results.page} of {Math.ceil(results.total / 50)}</span>
        <button type="button" disabled={busy || results.page * 50 >= results.total} onClick={() => void search(searched, results.page + 1)} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">Next</button>
      </div>}
    </div>}
  </section>;
}
