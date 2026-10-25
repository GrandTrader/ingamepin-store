"use client";
import Link from "next/link";
import { listWupexImports } from "./import-actions";
import { useEffect, useRef, useState } from "react";
import { connectWupex, loadWupexDashboard, loadWupexProducts } from "./actions";
import type { WupexCatalog, WupexDashboard, WupexCatalogFilters } from "@/lib/wupex-types";

const sandboxUrl = "https://sandbox-service.wupex.com";
const inputClass = "mt-1 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
const buttonClass = "rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50";
const money = (n: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
const number = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);

export default function WupexPanel() {
  const [dashboard, setDashboard] = useState<WupexDashboard | null>(null);
  const [catalog, setCatalog] = useState<WupexCatalog | null>(null);
  const [baseUrl, setBaseUrl] = useState(sandboxUrl);
  const [mode, setMode] = useState("sandbox");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState(""), [region, setRegion] = useState("");
  const [filterOptions, setFilterOptions] = useState<WupexCatalogFilters | null>(null);
  const [filterError, setFilterError] = useState("");
  const [filterAttempt, setFilterAttempt] = useState(0);
  const [applied, setApplied] = useState({ query: "", kind: "", category: "", region: "" });
  const sequence = useRef(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [imports, setImports] = useState<{ id: string; name: string; status: string; markup: number }[]>([]);
  const [importPage, setImportPage] = useState(1), [importTotal, setImportTotal] = useState(0);
  async function loadImports(page: number) { setBusy(true); try { const result = await listWupexImports(page); if (result.data) { setImports(result.data); setImportPage(page); setImportTotal(result.total ?? 0); } else setError(result.error ?? "Unable to load imports."); } catch { setError("Unable to load imported products."); } finally { setBusy(false); } }

  useEffect(() => {
    let active = true;
    loadWupexDashboard().then(result => {
      if (!active) return;
      setDashboard(result);
      if (result.baseUrl) { setBaseUrl(result.baseUrl); setMode(result.sandbox ? "sandbox" : "live"); }
    }).catch(() => { if (active) setError("Unable to load Wupex. Refresh the page or sign in again."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dashboard?.connected) return;
    let active = true;
    const controller = new AbortController();
    fetch("/api/admin/wupex/catalog-filters", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json() as { data?: WupexCatalogFilters };
        if (!result.data || !Array.isArray(result.data.categories) || !Array.isArray(result.data.regions)) throw new Error();
        if (active) { setFilterOptions(result.data); setFilterError(""); }
      })
      .catch(() => { if (active) setFilterError("Category and region filters could not load."); });
    return () => { active = false; controller.abort(); };
  }, [dashboard?.connected, dashboard?.baseUrl, filterAttempt]);

  function retryFilters() { setFilterOptions(null); setFilterError(""); setFilterAttempt(value => value + 1); }

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    sequence.current++; setCatalog(null);
    try {
      const result = await connectWupex(values);
      if (result.error) { setError(result.error); return; }
      form.reset();
      setMessage("Connection verified and saved.");
      retryFilters();
      const refreshed = await loadWupexDashboard();
      setDashboard(refreshed);
      if (refreshed.baseUrl) { setBaseUrl(refreshed.baseUrl); setMode(refreshed.sandbox ? "sandbox" : "live"); }
    } catch { setError("Unable to connect Wupex. Check your connection or sign in again."); }
    finally { setBusy(false); }
  }
  async function products(page: number, search = applied) {
    if (loadingProducts || busy) return;
    const request = ++sequence.current;
    setLoadingProducts(true); setError("");
    try {
      const result = await loadWupexProducts(page, search.query, search.kind, { category: search.category, region: search.region });
      if (request !== sequence.current) return;
      if (!result.data) { setError(result.error ?? "Unable to load products."); return; }
      setCatalog(result.data); setApplied(search); setSelected([]);
    } catch { setError("Unable to load products. Please refresh."); }
    finally { if (request === sequence.current) setLoadingProducts(false); }
  }
  async function refresh() {
    if (busy || loadingProducts) return;
    setBusy(true); setError("");
    try { setDashboard(await loadWupexDashboard()); }
    catch { setError("Unable to refresh Wupex. Please sign in again."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {!dashboard ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Checking Wupex connection…</p> : <>
      {dashboard.errors.map((text, i) => <p key={i} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{text}</p>)}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Connection</p>
          <p className="mt-1 font-bold">{dashboard.connected ? (dashboard.sandbox ? "Sandbox connected" : "Live connected") : "Not connected"}</p>
          {dashboard.baseUrl && <p className="mt-1 break-all text-xs text-slate-500">{dashboard.baseUrl}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{dashboard.sandbox ? "Sandbox balance" : "Supplier balance"}</p>
          <p className="mt-1 text-2xl font-black">{dashboard.balance ? money(dashboard.balance.amount, dashboard.balance.currency) : "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Wupex pre-orders</p>
          <p className="mt-1 font-bold">{dashboard.preorderEnabled === null ? "Not checked" : dashboard.preorderEnabled ? "Enabled by supplier" : "Disabled by supplier"}</p>
          <button type="button" onClick={() => void refresh()} disabled={busy || loadingProducts} className="mt-2 text-sm font-bold text-blue-700 disabled:opacity-50">{busy ? "Checking…" : "Refresh connection"}</button>
        </div>
      </section>
      <details open={!dashboard.connected} className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-bold">{dashboard.connected ? "Connection settings" : "Connect Wupex"}</summary>
        {dashboard.configuredByEnvironment ? <p className="mt-3 text-sm text-slate-600">This connection uses server environment settings.</p> :
          <form onSubmit={connect} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-semibold">Environment
                <select value={mode} disabled={busy || loadingProducts} onChange={e => { setMode(e.target.value); setBaseUrl(e.target.value === "sandbox" ? sandboxUrl : ""); }} className={inputClass}>
                  <option value="sandbox">Sandbox — testing</option><option value="live">Live account</option>
                </select>
              </label>
              <label className="min-w-0 text-sm font-semibold">Service URL
                <input name="baseUrl" type="url" required value={baseUrl} readOnly={mode === "sandbox"} onChange={e => setBaseUrl(e.target.value)} className={inputClass} placeholder="HTTPS service URL from Wupex" autoComplete="off" />
              </label>
              <label className="min-w-0 text-sm font-semibold">API key
                <input name="apiKey" type="password" required minLength={8} maxLength={2048} autoComplete="new-password" className={inputClass} placeholder="Your Wupex API key" />
              </label>
              <label className="min-w-0 text-sm font-semibold">Merchant code
                <input name="merchantCode" required maxLength={200} autoComplete="off" className={inputClass} placeholder="From your Wupex profile menu" />
              </label>
            </div>
            <p className="text-xs text-slate-500">Keys are stored securely and are never shown in the browser after saving. Use the service URL provided by Wupex, not the portal address.</p>
            <button disabled={busy || loadingProducts || !dashboard.databaseReady} className={buttonClass}>{busy ? "Checking connection…" : "Verify & save connection"}</button>
          </form>}
      </details>
      {dashboard.connected && <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div>
          <h2 className="text-lg font-bold">Supplier catalogue</h2>
          <p className="mt-1 text-xs text-slate-500">Browsing products does not place an order or spend your supplier balance.</p>
        </div>{dashboard.sandbox && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Test catalogue</span>}</div>
        <form onSubmit={e => { e.preventDefault(); void products(1, { query, kind, category, region }); }} className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.8fr)_auto]">
          <label className="min-w-0 text-xs font-semibold text-slate-600">Search<input aria-label="Search Wupex products" value={query} onChange={e => setQuery(e.target.value)} maxLength={150} placeholder="Search product name" className={inputClass} /></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Category<select aria-label="Supplier category" value={category} onChange={e => setCategory(e.target.value)} disabled={!filterOptions} className={inputClass}><option value="">All categories</option>{filterOptions?.categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Region<select aria-label="Supplier region" value={region} onChange={e => setRegion(e.target.value)} disabled={!filterOptions} className={inputClass}><option value="">All regions</option>{filterOptions?.regions.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Product type<select aria-label="Product type" value={kind} onChange={e => setKind(e.target.value)} className={inputClass}><option value="">All products</option><option value="voucher">Vouchers</option><option value="topup">Top-ups</option></select></label>
          <button disabled={busy || loadingProducts} className={buttonClass}>{loadingProducts ? "Loading…" : "Load products"}</button>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          {!filterOptions && !filterError ? <span role="status" className="text-slate-500">Loading category and region filters…</span> : filterError ? <span role="alert" className="text-amber-800">{filterError} <button type="button" onClick={retryFilters} className="font-bold underline">Retry filters</button></span> : <span className="text-slate-500">{filterOptions?.categories.length} categories · {filterOptions?.regions.length} regions</span>}
          <button type="button" disabled={busy || loadingProducts} onClick={() => { setQuery(""); setKind(""); setCategory(""); setRegion(""); void products(1, { query: "", kind: "", category: "", region: "" }); }} className="font-bold text-blue-700 disabled:opacity-50">Reset filters</button>
        </div>
        {catalog && <>
          <p className="mt-3 text-xs text-slate-500">{catalog.totalCount} products · Page {catalog.page} of {Math.max(1, catalog.totalPages)}</p>
          <div className="mt-3 grid gap-3">
            {catalog.products.length === 0 ? <p className="p-4 text-sm text-slate-500">No matching products.</p> : catalog.products.map(product =>
              <article key={product.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0"><label className="flex items-start gap-3 font-bold"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" aria-label={"Select " + product.name} checked={selected.includes(product.id)} onChange={e => setSelected(e.target.checked ? [...selected, product.id] : selected.filter(id => id !== product.id))}/><span className="break-words">{product.name}</span></label><p className="mt-1 break-all text-xs text-slate-500">{product.sku} · ID {product.id}</p>
                  <p className="mt-1 text-xs text-slate-600">{product.cardType === "voucher" ? "Voucher" : "Top-up"}{product.region ? " · " + product.region : ""}{product.faceValue !== null ? " · Face value " + number(product.faceValue) : ""}</p>
                </div>
                <div className="flex flex-wrap gap-6 sm:block sm:text-right"><div><p className="text-xs text-slate-500">Supplier price</p><p className="font-bold">{number(product.price)}</p></div>
                  <div className="sm:mt-1"><p className="text-xs text-slate-500">Available</p><p className="text-sm font-bold">{product.available === null ? "Not reported" : product.available === 0 ? "Out of stock" : number(product.available)}</p></div>
                </div>
              </article>)}
          </div>
          {selected.length > 0 && <Link className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white" href={"/admin/wupex/import?" + new URLSearchParams({ ids: selected.join(","), q: applied.query, category: applied.category, region: applied.region }).toString()}>Import selected ({selected.length})</Link>}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" disabled={busy || loadingProducts || catalog.page <= 1} onClick={() => void products(catalog.page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">Previous</button>
            <button type="button" disabled={busy || loadingProducts || catalog.page >= catalog.totalPages} onClick={() => void products(catalog.page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">Next</button>
          </div>
        </>}
      </section>}
      <section className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Imported products</h2><button disabled={busy} onClick={() => void loadImports(1)} className="text-sm font-bold text-blue-700">View imported products</button></div>{imports.map(p => <Link key={p.id} href={"/admin/products/" + p.id + "/edit/supplier"} className="mt-3 block rounded-lg border p-3 text-sm"><span className="font-bold">{p.name}</span><span className="mt-1 block text-slate-500">{p.status} · Markup {p.markup}%</span></Link>)}{importTotal > 20 && <div className="mt-3 flex justify-between"><button disabled={busy || importPage <= 1} onClick={() => void loadImports(importPage - 1)}>Previous imports</button><button disabled={busy || importPage * 20 >= importTotal} onClick={() => void loadImports(importPage + 1)}>Next imports</button></div>}</section>
    </>}
  </div>;
}
