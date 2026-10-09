"use client";

import { useEffect, useState } from "react";
import { MAX_CATALOG_BYTES, catalogCsv } from "@/lib/catalog-import";
import { PRICE_COLUMNS, priceImportTemplate } from "@/lib/bulk-price-import";
import { promotionExpiryLabel } from "@/lib/product-promotions";
import { catalogHistory, catalogRunDetails, processCatalogBatch } from "./actions";
import { exportExistingPrices, previewPriceImport, startPriceImport } from "./price-actions";

type Preview = Awaited<ReturnType<typeof previewPriceImport>>;
type History = NonNullable<Awaited<ReturnType<typeof catalogHistory>>["runs"]>;
type Details = Awaited<ReturnType<typeof catalogRunDetails>>;
const button = "rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50";
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const money = (value: number) => `$${value.toFixed(2)}`;
export default function PriceImportForm({ ready }: { ready: boolean }) {
  const [csv, setCsv] = useState(""), [filename, setFilename] = useState("prices.csv"), [preview, setPreview] = useState<Preview | null>(null);
  const [requestId, setRequestId] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [runs, setRuns] = useState<History>([]), [details, setDetails] = useState<Details | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 }), [results, setResults] = useState<{ sku: string; status: string; message?: string }[]>([]);
  useEffect(() => { void catalogHistory().then(r => { if (r.runs) setRuns(r.runs); }); }, []);
  const input = { csv, filename };
  const refresh = async () => { const r = await catalogHistory(); if (r.error) throw Error(r.error); setRuns(r.runs || []); };
  const task = async (work: () => Promise<void>) => { setBusy(true); setNotice(""); try { await work(); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to update prices."); } finally { setBusy(false); } };
  async function batches(id: string, undo = false) {
    setResults([]); setPreview(null); let offset = 0, rejected = 0;
    for (;;) {
      const r = await processCatalogBatch(id, offset, undo);
      if (r.error || r.next === undefined) throw Error(r.error || "Price update paused. Resume from history.");
      setResults(old => [...old, ...(r.results || [])]);
      rejected += (r.results || []).filter(row => ["REJECTED", "PROTECTED"].includes(row.status)).length;
      setProgress({ done: r.next, total: r.count! }); offset = r.next;
      if (offset >= r.count!) break;
    }
    setNotice(undo ? "Undo finished. Later changes and orders are preserved." : rejected ? `Finished with ${rejected} rejected products. Review the results below.` : "Prices, discounts and expiry dates updated successfully.");
    await refresh();
  }
  return <div className="mt-6 space-y-6">
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-bold">Upload prices and discounts</h2>
      <p className="mt-2 text-sm text-slate-600">Update existing fixed-price options in any category. Regular prices are in USD and should already include your markup. Dates without a timezone use IST.</p>
      <p className="mt-2 text-sm text-slate-600">Blank price or discount cells keep the current setting. Discount 0 turns off that option’s sale. Every positive discount needs an expiry; the regular price applies after expiry.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className={button} disabled={busy || !ready} onClick={() => task(async () => { const r = await exportExistingPrices(); if (r.error) throw Error(r.error); download("existing-product-prices.csv", r.csv!); setNotice(`Downloaded ${r.count} fixed-price options. Edit their prices or discounts, then upload the file here.`); })}>Download existing prices</button>
        <button className="rounded-lg border px-4 py-2 font-bold" disabled={busy} onClick={() => download("price-discount-template.csv", priceImportTemplate())}>Download blank template</button>
      </div>
      <fieldset disabled={busy || !ready} className="mt-5 space-y-4">
        <label className="grid gap-2 text-sm font-bold">Price update CSV<input type="file" accept=".csv,text/csv" onChange={async event => {
          setPreview(null); setRequestId(""); setCsv(""); setNotice(""); setResults([]); setProgress({ done: 0, total: 0 });
          const file = event.target.files?.[0]; if (!file) return;
          try { if (file.size > MAX_CATALOG_BYTES || !/\.csv$/i.test(file.name)) throw Error("Choose a UTF-8 CSV no larger than 512 KB."); setCsv(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())); setFilename(file.name); }
          catch (e) { setNotice(e instanceof Error ? e.message : "Save the file as CSV UTF-8."); }
        }} /></label>
        <button className={button} disabled={!csv} onClick={() => task(async () => { const p = await previewPriceImport(input); if (p.error) throw Error(p.error); setPreview(p); setRequestId(crypto.randomUUID()); setDetails(null); setNotice("Preview ready. No prices have been changed."); })}>Preview price changes</button>
      </fieldset>
    </section>
    {!!preview?.errors?.length && <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Correct {preview.errors.length} rows before uploading</h2><ul className="mt-3 max-h-60 overflow-auto text-sm">{preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}</ul><button className="mt-3 font-bold underline" onClick={() => download("rejected-price-rows.csv", catalogCsv(["row", ...PRICE_COLUMNS, "error"], preview.errors!.map(e => [e.row, ...PRICE_COLUMNS.map(k => e.values[k] || ""), e.error])))}>Download rejected rows</button></section>}
    {!!preview?.rows?.length && <section className="rounded-2xl border bg-white p-5">
      <h2 className="font-bold">Review {preview.rows.length} options across {preview.productCount} products</h2>
      <div className="mt-4 max-h-[520px] overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr>{["Product / option", "Current sale price", "New regular price", "Discount", "New sale price", "Expiry (IST)"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{preview.rows.map(r => <tr key={r.row} className="border-t"><td className="max-w-sm p-3"><strong>{r.product}</strong><div>{r.option}</div>{r.warning && <p className="text-amber-800">{r.warning}</p>}</td><td className="p-3">{money(r.previous)}</td><td className="p-3">{money(r.regular)}</td><td className="p-3">{r.percent}%</td><td className="p-3 font-bold">{money(r.sale)}</td><td className="p-3">{r.expires ? promotionExpiryLabel(r.expires) : "No sale"}</td></tr>)}</tbody></table></div>
      <button className={`${button} mt-4`} disabled={busy || !!preview.errors?.length} onClick={() => task(async () => { const r = await startPriceImport(input, preview.digest!, requestId); if (r.error) throw Error(r.error); await batches(r.id!); })}>Apply these price and discount updates</button>
    </section>}
    {notice && <p role="status" className="rounded-xl border bg-white p-4">{notice}</p>}
    {progress.total > 0 && <div><progress className="w-full" value={progress.done} max={progress.total} /><p>{progress.done} / {progress.total} products processed</p></div>}
    {!!results.length && <ul className="max-h-60 overflow-auto rounded-xl border bg-white p-4 text-sm">{results.map(r => <li key={r.sku}>{r.sku}: <strong>{r.status}</strong>{r.message ? ` — ${r.message}` : ""}</li>)}</ul>}
    <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-bold">Price update history</h2><button disabled={busy} className="text-blue-600 underline" onClick={() => task(refresh)}>Refresh history</button></div><p className="mt-2 text-sm text-slate-600">Resume interrupted uploads. Undo preserves products with later changes or orders.</p>
      <ul className="mt-4 divide-y">{runs.filter(r => r.settings?.mode === "prices").map(r => <li key={r.id} className="flex flex-wrap justify-between gap-3 py-3"><div><strong>{r.filename}</strong><p className="text-sm">{r.status} · {promotionExpiryLabel(r.created_at)}</p></div><div className="flex gap-3 text-sm font-bold text-blue-600"><button disabled={busy} onClick={() => task(async () => { const d = await catalogRunDetails(r.id); if (d.error) throw Error(d.error); setDetails(d); })}>View changes</button>{r.status === "RUNNING" && <button disabled={busy} onClick={() => task(() => batches(r.id))}>Resume</button>}{["COMPLETED", "PARTIAL_ROLLBACK"].includes(r.status) && <button disabled={busy} onClick={() => { if (window.confirm("Restore the previous prices and discounts for unchanged products in this upload?")) void task(() => batches(r.id, true)); }}>Undo update</button>}</div></li>)}</ul>
      {!!details?.changes?.length && <div className="mt-4 max-h-96 space-y-3 overflow-auto">{details.changes.map((d, i) => <details key={i} className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-bold">{d.sku} · {d.status}</summary>{d.message && <p>{d.message}</p>}{d.fields.map((f, j) => <div key={j} className="mt-3 break-words text-sm"><strong>{f.field}</strong><p>Before: {f.before || "—"}</p><p>After: {f.after || "—"}</p></div>)}</details>)}</div>}
    </section>
  </div>;
}
