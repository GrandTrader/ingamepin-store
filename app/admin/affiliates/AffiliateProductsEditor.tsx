"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { filterAffiliateProducts, parseAffiliateProductChanges, type AffiliateProduct, type AffiliateProductFilters } from "@/lib/affiliate-product-settings";
import { saveDisplayedAffiliateProducts } from "./actions";

const emptyFilters: AffiliateProductFilters = { search: "", category: "", region: "", status: "", affiliate: "" };
const control = "mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
type Draft = { enabled: boolean; commission: string };

export default function AffiliateProductsEditor({ products, categories }: {
  products: AffiliateProduct[];
  categories: { id: string; name: string }[];
}) {
  const [saved, setSaved] = useState(products);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(products.map(p => [p.id, {
    enabled: p.affiliate_enabled, commission: String(p.affiliate_commission_percent),
  }])));
  const [filters, setFilters] = useState(emptyFilters);
  const [bulkRate, setBulkRate] = useState("");
  const [bulkEnabled, setBulkEnabled] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const displayed = useMemo(() => filterAffiliateProducts(saved, filters), [saved, filters]);
  const regions = useMemo(() => [...new Set(products.map(p => p.region || "Global"))].sort(), [products]);
  const statuses = useMemo(() => [...new Set(products.map(p => p.status))].sort(), [products]);
  const changeFilter = (key: keyof AffiliateProductFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const edit = (id: string, change: Partial<Draft>) => {
    setDrafts(current => ({ ...current, [id]: { ...current[id], ...change } }));
    setNotice(null);
  };

  function applyToDisplayed() {
    if (!bulkRate.trim() && !bulkEnabled) return;
    const next = { ...drafts };
    for (const product of displayed) {
      next[product.id] = {
        enabled: bulkEnabled ? bulkEnabled === "ENABLED" : drafts[product.id].enabled,
        commission: bulkRate.trim() || drafts[product.id].commission,
      };
    }
    try {
      parseAffiliateProductChanges(displayed.map(p => ({ id: p.id, enabled: next[p.id].enabled, commission: Number(next[p.id].commission) })));
      setDrafts(next);
      setNotice({ error: false, text: `Applied to ${displayed.length} displayed products. Save changes below to finish.` });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Check the commission settings." });
    }
  }

  function save() {
    if (saving.current || !displayed.length) return;
    let changes;
    try {
      if (displayed.some(p => !drafts[p.id].commission.trim())) throw new Error("Enter a commission for every displayed product.");
      changes = parseAffiliateProductChanges(displayed.map(p => ({ id: p.id, enabled: drafts[p.id].enabled, commission: Number(drafts[p.id].commission) })));
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Check the product settings." });
      return;
    }
    saving.current = true;
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await saveDisplayedAffiliateProducts(changes);
        if (!result.ok) { setNotice({ error: true, text: result.message }); return; }
        const byId = new Map(changes.map(change => [change.id, change]));
        setSaved(current => current.map(p => {
          const change = byId.get(p.id);
          return change ? { ...p, affiliate_enabled: change.enabled, affiliate_commission_percent: change.commission } : p;
        }));
        setNotice({ error: false, text: result.message });
      } catch {
        setNotice({ error: true, text: "Unable to confirm the save. Your edits are retained; please try again." });
      } finally { saving.current = false; }
    });
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="affiliate-products-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="affiliate-products-title" className="text-2xl font-black">Affiliate Products</h2>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{displayed.length} of {saved.length} products</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Enable affiliate promotion and set the maximum commission for your products.</p>
      <fieldset disabled={pending} className="mt-5 min-w-0 disabled:opacity-70">
        <legend className="sr-only">Filter and edit affiliate products</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-bold text-slate-600">Search products<input type="search" className={control} placeholder="Product name…" value={filters.search} onChange={e => changeFilter("search", e.target.value)} /></label>
          <label className="text-xs font-bold text-slate-600">Category<select aria-label="Category" className={control} value={filters.category} onChange={e => changeFilter("category", e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Region<select aria-label="Region" className={control} value={filters.region} onChange={e => changeFilter("region", e.target.value)}><option value="">All regions</option>{regions.map(region => <option key={region}>{region}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Product status<select aria-label="Product status" className={control} value={filters.status} onChange={e => changeFilter("status", e.target.value)}><option value="">All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Affiliate status<select aria-label="Affiliate status" className={control} value={filters.affiliate} onChange={e => changeFilter("affiliate", e.target.value)}><option value="">All affiliate settings</option><option value="ENABLED">Enabled</option><option value="DISABLED">Disabled</option></select></label>
        </div>
        <button type="button" onClick={() => setFilters(emptyFilters)} className="mt-3 text-sm font-bold text-blue-700">Clear filters</button>
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold">Apply one setting to all displayed products</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-bold text-slate-600">Maximum commission (%)<input className={control} type="number" min="0" max="25" step="0.01" placeholder="Keep current rates" value={bulkRate} onChange={e => setBulkRate(e.target.value)} /></label>
            <label className="text-xs font-bold text-slate-600">Affiliate promotion<select aria-label="Affiliate promotion" className={control} value={bulkEnabled} onChange={e => setBulkEnabled(e.target.value)}><option value="">Keep current setting</option><option value="ENABLED">Enable</option><option value="DISABLED">Disable</option></select></label>
            <button type="button" onClick={applyToDisplayed} disabled={!displayed.length || (!bulkRate.trim() && !bulkEnabled)} className="rounded-lg border border-blue-600 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 disabled:opacity-50">Apply to displayed</button>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {displayed.map(product => <article key={product.id} className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto_180px] md:items-center">
            <div className="min-w-0"><p className="break-words font-black">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.status} · {product.region || "Global"}</p></div>
            <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" aria-label={`Enable ${product.name}`} checked={drafts[product.id].enabled} onChange={e => edit(product.id, { enabled: e.target.checked })} className="h-5 w-5 accent-blue-600" />Enabled</label>
            <label className="text-xs font-bold text-slate-600">Maximum commission (%)<input type="number" aria-label={`Commission for ${product.name}`} min="0" max="25" step="0.01" required value={drafts[product.id].commission} onChange={e => edit(product.id, { commission: e.target.value })} className={control} /></label>
          </article>)}
          {!displayed.length && <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No products match these filters.</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">Only the {displayed.length} displayed products will be saved. Hidden products keep their settings.</p>
          <button type="button" onClick={save} disabled={!displayed.length || pending} className="admin-save-action rounded-xl px-5 py-3 text-sm font-black disabled:opacity-50">{pending ? "Saving…" : `Save changes to ${displayed.length} displayed products`}</button>
        </div>
      </fieldset>
      {notice && <p role={notice.error ? "alert" : "status"} className={`mt-4 rounded-lg border p-3 text-sm ${notice.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
    </section>
  );
}
