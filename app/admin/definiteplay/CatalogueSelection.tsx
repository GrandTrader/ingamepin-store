"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DefinitePlayItem } from "@/lib/definiteplay-types";

type Filters = { q: string; category: string; region: string; variant: string };

export default function CatalogueSelection({ items, total, page, filters, initialSelection }: {
  items: DefinitePlayItem[]; total: number; page: number; filters: Filters; initialSelection: string[];
}) {
  const [selected, setSelected] = useState(initialSelection);
  const allBox = useRef<HTMLInputElement>(null);
  const pageSkus = items.map(item => item.sku);
  const allSelected = pageSkus.length > 0 && pageSkus.every(sku => selected.includes(sku));
  const someSelected = pageSkus.some(sku => selected.includes(sku));
  const combined = [...new Set([...selected, ...pageSkus])];
  useEffect(() => { if (allBox.current) allBox.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  const importHref = "/admin/definiteplay/import?" + new URLSearchParams({ ...filters, skus: selected.join(",") });
  const pageHref = (next: number) => "/admin/definiteplay?" + new URLSearchParams({
    ...filters, page: String(next), ...(selected.length ? { selected: selected.join(",") } : {}),
  });
  function toggle(sku: string) {
    setSelected(current => current.includes(sku) ? current.filter(value => value !== sku)
      : current.length < 50 ? [...current, sku] : current);
  }

  return <>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-slate-500">{total.toLocaleString()} matching products</p>
        <p role="status" className="mt-1 text-sm font-bold text-blue-700">{selected.length} selected (maximum 50)</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {selected.length > 0 && <button type="button" onClick={() => setSelected([])} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold">Clear selection</button>}
        {selected.length > 0 ? <Link href={importHref} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">Import selected products ({selected.length})</Link>
          : <button type="button" disabled className="rounded-xl bg-slate-200 px-5 py-3 text-sm font-bold text-slate-500">Import selected products</button>}
      </div>
    </div>
    <p className="mb-3 text-sm text-slate-600">Choose items to review as options under one product. Selections carry over between pages; applying new filters clears them.</p>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm">
      <thead className="bg-slate-50"><tr>
        <th className="w-12 p-3"><input ref={allBox} type="checkbox" aria-label="Select all products on this page"
          checked={allSelected} disabled={!items.length || (!allSelected && combined.length > 50)}
          onChange={() => setSelected(allSelected ? selected.filter(sku => !pageSkus.includes(sku)) : combined)}
          className="h-4 w-4 accent-blue-600" /></th>
        {["Product", "Region / value", "Supplier cost", "Availability", "Delivery", "Import"].map(label => <th key={label} className="p-3">{label}</th>)}
      </tr></thead>
      <tbody>{items.map(item => <tr key={item.sku} className={`border-t ${selected.includes(item.sku) ? "bg-blue-50" : ""}`}>
        <td className="p-3"><input type="checkbox" aria-label={`Select ${item.name} (${item.sku})`}
          checked={selected.includes(item.sku)} disabled={selected.length >= 50 && !selected.includes(item.sku)}
          onChange={() => toggle(item.sku)} className="h-4 w-4 accent-blue-600" /></td>
        <td className="p-3"><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">Code: {item.sku}</p></td>
        <td className="p-3">{item.region}<br />{item.cardValue} {item.cardCurrency}</td>
        <td className="whitespace-nowrap p-3">{item.currency} {item.price}</td>
        <td className="p-3">{item.stock === null ? "Available (quantity unspecified)" : item.stock.toLocaleString()}</td>
        <td className="p-3">{item.asyncOnly ? "Processing required" : "Standard processing"}<br />{item.deliveryMethod}</td>
        <td className="p-3"><Link className="whitespace-nowrap font-bold text-blue-600" href={"/admin/definiteplay/import?" + new URLSearchParams({ ...filters, skus: item.sku })}>Import this item</Link></td>
      </tr>)}</tbody>
    </table>{!items.length && <p className="p-6 text-slate-500">No products found.</p>}</div>
    {combined.length > 50 && !allSelected && <p className="mt-2 text-sm text-amber-800">Select individual items to stay within the 50-item limit.</p>}
    <nav className="mt-5 flex items-center justify-between" aria-label="Supplier catalogue pages">
      {page > 1 ? <Link className="text-blue-600" href={pageHref(page - 1)}>← Previous</Link> : <span />}
      <span>Page {page}</span>
      {page * 30 < total ? <Link className="text-blue-600" href={pageHref(page + 1)}>Next →</Link> : <span />}
    </nav>
  </>;
}
