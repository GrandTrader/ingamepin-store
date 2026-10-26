"use client";
import { useEffect, useId, useState } from "react";
import type { DigiSellerLogPage, DigiSellerLogRow } from "@/lib/digiseller-order-log";

const sourceLabels = { stock: "Own stock", definiteplay: "DefinitePlay", fkwallet: "FKWallet" };
const stateLabels: Record<string, string> = {
  DELIVERED: "Delivered", QUEUED: "Queued", SUBMITTED: "Submitted", WAITING: "Waiting",
  UNCERTAIN: "Needs review", REVIEW: "Needs review", REJECTED: "Rejected",
};
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function DeliveredContent({ productId, row }: { productId: string; row: DigiSellerLogRow }) {
  const [open, setOpen] = useState(false);
  const [goods, setGoods] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const contentId = useId();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams({ invoice: row.invoiceId, source: row.source });
        const response = await fetch("/api/admin/products/" + productId + "/digiseller-orders?" + query, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || typeof result.goods !== "string") throw new Error(result.error || "Unable to load delivered content.");
        if (!controller.signal.aborted) setGoods(result.goods);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load delivered content.");
      }
    }
    void load();
    return () => controller.abort();
  }, [open, productId, row.invoiceId, row.source]);
  return <div className="mt-3">
    <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => { setOpen(!open); setGoods(null); setError(""); setCopied(false); setCopyError(""); }} className="min-h-10 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700">{open ? "Hide delivered content" : "View codes / delivery"}</button>
    {open && <div id={contentId} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {error ? <p role="alert" className="text-sm text-red-700">{error} Close and reopen to retry.</p> : goods === null ? <p role="status" className="text-sm text-slate-500">Fetching delivered content…</p> : goods ? <>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-sm">{goods}</pre>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(goods); setCopied(true); setCopyError(""); } catch { setCopyError("Copy failed. Select the content to copy it manually."); } }} className="mt-3 min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">{copied ? "Copied" : "Copy content"}</button>
        {copyError && <p role="status" className="mt-2 text-sm text-red-700">{copyError}</p>}
      </> : <p className="text-sm text-slate-500">No delivered content was saved.</p>}
    </div>}
  </div>;
}

export default function DigiSellerOrderLog({ productId, deliveredOnly = false }: { productId: string; deliveredOnly?: boolean }) {
  const [draft, setDraft] = useState("");
  const [invoice, setInvoice] = useState("");
  const [delivered, setDelivered] = useState(deliveredOnly);
  const [cursors, setCursors] = useState<string[]>([""]);
  const [page, setPage] = useState<DigiSellerLogPage | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const before = cursors.at(-1) || "";
  const inputId = useId();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setPage(null); setError("");
      try {
        const query = new URLSearchParams();
        if (invoice) query.set("invoice", invoice);
        if (before) query.set("before", before);
        if (deliveredOnly || delivered) query.set("delivered", "1");
        const response = await fetch("/api/admin/products/" + productId + "/digiseller-orders?" + query, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.rows)) throw new Error(result.error || "Unable to load DigiSeller orders.");
        if (!controller.signal.aborted) setPage(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load DigiSeller orders.");
      }
    }
    void load();
    return () => controller.abort();
  }, [productId, invoice, before, deliveredOnly, delivered, refresh]);
  function resetPage() { setPage(null); setCursors([""]); }
  return <section className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-black">{deliveredOnly ? "DigiSeller sales" : "DigiSeller orders log"}</h2>
        <p className="mt-1 text-sm text-slate-500">{deliveredOnly ? "Delivered sales with their DigiSeller invoice reference." : "Orders received by this website from DigiSeller, newest invoice first."} Dates in India time (IST).</p></div>
      <button type="button" onClick={() => { resetPage(); setRefresh(value => value + 1); }} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">Refresh log</button>
    </div>
    <form onSubmit={event => { event.preventDefault(); resetPage(); setInvoice(draft.trim()); setRefresh(value => value + 1); }} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-48"><label htmlFor={inputId} className="text-xs font-bold text-slate-600">DigiSeller invoice reference</label><input id={inputId} value={draft} onChange={event => setDraft(event.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="Search invoice number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
      {!deliveredOnly && <label className="min-w-0 flex-1 basis-40 text-xs font-bold text-slate-600">Status<select aria-label="DigiSeller order status" value={delivered ? "delivered" : "all"} onChange={event => { resetPage(); setDelivered(event.target.value === "delivered"); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"><option value="all">All orders</option><option value="delivered">Delivered only</option></select></label>}
      <button className="min-h-10 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Search</button>
      {invoice && <button type="button" onClick={() => { resetPage(); setDraft(""); setInvoice(""); }} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold">Clear</button>}
    </form>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error} Use Refresh log to try again.</p> : !page ? <p role="status" className="mt-4 text-sm text-slate-500">Fetching DigiSeller orders…</p> : <>
      <div className="mt-4 space-y-3">{page.rows.map(row => <article key={row.source + row.invoiceId} className="rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-all font-bold text-blue-700">DigiSeller #{row.invoiceId}</h3><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (row.state === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>{stateLabels[row.state] || row.state}</span></div>
        <p className="mt-2 break-words text-sm font-bold">{row.optionName} <span className="font-normal">× {row.quantity}</span></p>
        <p className="mt-1 break-words text-xs text-slate-500">{sourceLabels[row.source]} · Product ID {row.digiProductId} · {row.source === "stock" ? "Delivered" : "Ordered"} {row.date ? dateFormat.format(new Date(row.date)) : "—"}</p>
        {row.state === "DELIVERED" && <DeliveredContent productId={productId} row={row} />}
      </article>)}</div>
      {page.rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No {deliveredOnly ? "delivered DigiSeller sales" : "DigiSeller orders"}{invoice ? " match this invoice." : " recorded for this product."}</p>}
      {(cursors.length > 1 || page.next) && <div className="mt-4 flex items-center justify-between gap-2 text-sm"><button type="button" disabled={cursors.length === 1} onClick={() => { setPage(null); setCursors(values => values.slice(0, -1)); }} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button><span>Page {cursors.length}</span><button type="button" disabled={!page.next} onClick={() => { if (page.next) { setPage(null); setCursors(values => [...values, page.next!]); } }} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button></div>}
    </>}
  </section>;
}
