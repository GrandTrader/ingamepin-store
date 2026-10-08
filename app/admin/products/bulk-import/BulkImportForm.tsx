"use client";

import { useState } from "react";
import { CATALOG_COLUMNS, MAX_CATALOG_BYTES, catalogCsv, catalogTemplate, defaultColumnMapping, readCatalogCsv, type CatalogSettings, type CatalogIssue } from "@/lib/catalog-import";
import type { CatalogCategory } from "@/lib/catalog-import-plan";
import { catalogHistory, catalogRunDetails, previewCatalog, processCatalogBatch, saveCatalogPricing, startCatalogImport } from "./actions";

type Preview = Awaited<ReturnType<typeof previewCatalog>>;
type History = NonNullable<Awaited<ReturnType<typeof catalogHistory>>["runs"]>;
type Changes = NonNullable<Awaited<ReturnType<typeof catalogRunDetails>>["changes"]>;
const button = "rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50";
const inputStyle = "rounded-lg border border-slate-300 bg-white px-3 py-2";
function download(name: string, body: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function BulkImportForm({ ready, categories, initialSettings }: { ready: boolean; categories: CatalogCategory[]; initialSettings: CatalogSettings }) {
  const [settings, setSettings] = useState(initialSettings), [saved, setSaved] = useState(initialSettings);
  const [csv, setCsv] = useState(""), [filename, setFilename] = useState("catalog.csv"), [mapping, setMapping] = useState<Record<string, string>>({}), [headers, setHeaders] = useState<string[]>([]);
  const [categoryId, setCategory] = useState(""), [preview, setPreview] = useState<Preview | null>(null), [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [progress, setProgress] = useState({ done: 0, total: 0 });
  const [runs, setRuns] = useState<History>([]), [rejected, setRejected] = useState<CatalogIssue[]>([]), [details, setDetails] = useState<Changes>([]);
  const [results, setResults] = useState<{ sku: string; status: string; message?: string }[]>([]);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const invalidate = () => { setPreview(null); setRequestId(""); setRejected([]); };
  const input = { csv, mapping, categoryId, filename };
  async function refreshHistory() { const r = await catalogHistory(); if (r.runs) setRuns(r.runs); else setNotice(r.error || "Unable to read history."); }
  async function batches(id: string, undo = false) {
    setResults([]); setProgress({ done: 0, total: 0 }); let offset = 0;
    for (;;) {
      const r = await processCatalogBatch(id, offset, undo);
      if (r.error || r.next === undefined) throw new Error(r.error || "Import paused. Resume from history.");
      setResults(old => [...old, ...(r.results || [])]); setProgress({ done: r.next, total: r.count! });
      offset = r.next; if (offset >= r.count!) break;
    }
    setNotice(undo ? "Undo finished. Products with later changes or orders are preserved." : "Import finished. New products are drafts. Review the results below.");
    await refreshHistory();
  }
  async function task(fn: () => Promise<void>) { setBusy(true); setNotice(""); try { await fn(); } catch (e) { setNotice(e instanceof Error ? e.message : "Request interrupted. Refresh history to resume safely."); } finally { setBusy(false); } }
  function rejectedCsv() {
    const databaseErrors = results.filter(r => r.status === "REJECTED");
    const extra: CatalogIssue[] = databaseErrors.flatMap(r => {
      const game = preview?.games?.find(g => g.sku === r.sku);
      return game?.editions.map(e => ({ row: e.row, sku: e.sku, error: r.message || "Import rejected", values: { parent_sku: r.sku, sku: e.sku, option_name: e.option_name, platform: e.platform, price: e.price, ...e.source } })) || [];
    });
    download("rejected-catalog-rows.csv", catalogCsv(["row", ...CATALOG_COLUMNS, "error"], [...rejected, ...extra].map(e => [e.row, ...CATALOG_COLUMNS.map(k => e.values[k] || ""), e.error])));
  }
  return <div className="mt-6 space-y-6">
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-bold">Pricing</h2><p className="mt-1 text-sm text-slate-600">Your business pricing settings. Each edition: INR price × (1 + markup) ÷ INR per USD, rounded to 2 decimals.</p>
      <fieldset disabled={busy || !ready} className="mt-4 flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-bold">Markup (%)<input className={inputStyle} inputMode="decimal" value={settings.markup_percent} onChange={e => { setSettings({ ...settings, markup_percent: e.target.value }); invalidate(); }} /></label>
        <label className="grid gap-1 text-sm font-bold">INR per USD<input className={inputStyle} inputMode="decimal" value={settings.inr_per_usd} onChange={e => { setSettings({ ...settings, inr_per_usd: e.target.value }); invalidate(); }} /></label>
        <button className={button} type="button" disabled={!dirty} onClick={() => task(async () => { const r = await saveCatalogPricing(settings); if (r.error) throw new Error(r.error); setSaved(settings); invalidate(); setNotice("Pricing saved. Existing product prices change only when you import updated prices."); })}>Save pricing</button>
      </fieldset>
    </section>
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Upload and preview</h2><button type="button" className="font-bold text-blue-600" onClick={() => download("playstation-catalog-template.csv", catalogTemplate())}>Download CSV template</button></div>
      <p className="mt-2 text-sm text-slate-600">UTF-8 CSV · Up to 512 KB / 2,000 editions. Blank fields preserve existing values. Parent SKU groups editions; edition SKU identifies each option.</p>
      <p className="mt-2 text-sm text-slate-600">New products use Manual Delivery, Digital Delivery order mode and Unlimited Product stock. Images, delivery instructions, homepage visibility and affiliate settings use the existing product fields. Products remain drafts for review.</p>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        <label className="grid gap-2 text-sm font-bold">CSV file<input type="file" accept=".csv,text/csv" onChange={async e => { invalidate(); setNotice(""); const file = e.target.files?.[0]; if (!file) return; try { if (file.size > MAX_CATALOG_BYTES || !/\.csv$/i.test(file.name)) throw new Error("Choose a CSV file no larger than 512 KB."); const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); const h = readCatalogCsv(text)[0]; setCsv(text); setFilename(file.name); setHeaders(h); setMapping(defaultColumnMapping(h)); } catch (err) { setCsv(""); setHeaders([]); setNotice(err instanceof Error ? err.message : "Save this file as CSV UTF-8."); } }} /></label>
        <label className="grid max-w-lg gap-2 text-sm font-bold">Default category for new products<select className={inputStyle} value={categoryId} onChange={e => { setCategory(e.target.value); invalidate(); }}><option value="">Choose a category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {!!headers.length && <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-bold">Column mapping ({headers.length})</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{headers.map(h => <label key={h} className="grid gap-1 text-sm">{h}<select className={inputStyle} value={mapping[h] || ""} onChange={e => { setMapping({ ...mapping, [h]: e.target.value }); invalidate(); }}><option value="">Ignore column</option>{CATALOG_COLUMNS.map(c => <option key={c}>{c}</option>)}</select></label>)}</div></details>}
        <button type="button" className={button} disabled={!ready || !csv || dirty} onClick={() => task(async () => { const p = await previewCatalog(input); if (p.error) throw new Error(p.error); setPreview(p); setRejected(p.errors || []); setRequestId(crypto.randomUUID()); setResults([]); setNotice("Dry run complete. No products or import history were written."); })}>Preview only — no changes</button>
      </fieldset>
      {preview?.games && <div className="mt-5 space-y-4">
        <p className="font-bold">{preview.games.length} products · {preview.games.reduce((n, g) => n + g.editions.length, 0)} valid editions · {preview.errors.length} rejected rows</p>
        <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-bold">Review homepage and affiliate settings</summary><ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">{preview.games.map(g => <li key={g.sku}><strong>{g.title}</strong><div>Show on homepage: {g.settings.featured ? "Yes" : "No"} · Affiliates: {g.settings.affiliate ? `${g.settings.commission}%` : "Disabled"}</div></li>)}</ul></details>
        <div className="max-h-[520px] overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr>{["Product / edition", "SKU", "Platform", "INR", "USD", "Review"].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{preview.games.map(g => g.editions.map((e, i) => <tr className="border-t align-top" key={e.sku}><td className="min-w-56 p-3">{i === 0 && <><strong>{g.title}</strong><div className="text-xs text-blue-700">{g.action}</div></>}<div>{e.option_name}</div></td><td className="p-3">{e.sku}</td><td className="p-3">{e.platform}</td><td className="p-3">{e.source.store_price_inr || "Unverified"}</td><td className="p-3">{e.price === "0" ? "Blocked" : `$${e.price}`}</td><td className="min-w-64 p-3 text-xs">{e.warnings.map((w, j) => <p className="mb-1 text-amber-800" key={j}>{w}</p>)}{e.source.store_url && <a href={e.source.store_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Official Store source</a>}</td></tr>))}</tbody></table></div>
        <button className={button} type="button" disabled={busy || !preview.games.length} onClick={() => task(async () => { const r = await startCatalogImport(input, preview.digest, requestId); if (r.error || !r.id) throw new Error(r.error || "Unable to start."); await batches(r.id); })}>Import valid rows as drafts / updates</button>
        <p className="text-xs text-slate-600">New products are never published by this importer. Existing products retain their publication status.</p>
      </div>}
    </section>
    <div aria-live="polite" className="space-y-3">{notice && <p role="status" className="rounded-xl border bg-white p-4">{notice}</p>}{progress.total > 0 && <><progress className="w-full" value={progress.done} max={progress.total} /><p>{progress.done} / {progress.total} products processed</p></>}</div>
    {(rejected.length > 0 || results.length > 0) && <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">Results and rejected rows</h2><button className="text-blue-600 underline" onClick={rejectedCsv}>Download rejected CSV</button></div><ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">{rejected.map((r, i) => <li key={`e${i}`} className="text-red-700">Row {r.row} · {r.sku}: {r.error}</li>)}{results.map((r, i) => <li key={`r${i}`}>{r.sku}: <strong>{r.status}</strong> {r.message}</li>)}</ul></section>}
    <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between gap-2"><h2 className="text-lg font-bold">Import history</h2><button disabled={busy || !ready} onClick={() => task(refreshHistory)} className="text-blue-600 underline">Refresh history</button></div>
      <p className="mt-2 text-sm text-slate-600">Resume safely after an interruption. Undo preserves products changed afterward or used in an order.</p>
      <ul className="mt-4 divide-y">{runs.map(r => <li key={r.id} className="flex flex-wrap justify-between gap-3 py-3"><div><strong>{r.filename}</strong><p className="text-sm">{r.created_by_email} · {new Date(r.created_at).toLocaleString()} · {r.status}</p></div><div className="flex gap-3 text-sm font-bold text-blue-600">
        <button disabled={busy} onClick={() => task(async () => { const d = await catalogRunDetails(r.id); if (d.error) throw new Error(d.error); setDetails(d.changes || []); setRejected((d.errors || []) as CatalogIssue[]); setResults([]); })}>View changes</button>
        {r.status === "RUNNING" && <button disabled={busy} onClick={() => task(() => batches(r.id))}>Resume</button>}
        {["COMPLETED", "PARTIAL_ROLLBACK"].includes(r.status) && <button disabled={busy} onClick={() => { if (window.confirm("Undo this import? Unchanged new drafts will be removed and unchanged updates restored. Later changes and orders are protected.")) task(() => batches(r.id, true)); }}>Undo import</button>}
      </div></li>)}</ul>
      {!!details.length && <div className="mt-4 max-h-96 space-y-3 overflow-auto">{details.map(d => <details key={d.sku} className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold">{d.sku} · {d.status} · {d.fields.length} changes</summary>{d.message && <p>{d.message}</p>}<table className="mt-2 w-full table-fixed text-left text-xs"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{d.fields.map((f, i) => <tr key={i} className="border-t align-top"><td className="break-words p-2">{f.field}</td><td className="whitespace-pre-wrap break-words p-2">{f.before || "—"}</td><td className="whitespace-pre-wrap break-words p-2">{f.after || "—"}</td></tr>)}</tbody></table></details>)}</div>}
    </section>
  </div>;
}
