"use client";
import { parseVoucherCsvRecords } from "@/lib/paired-voucher-import";
import UploadedProductCodes from "./UploadedProductCodes";
import AdminSubmitButton from "@/components/AdminSubmitButton";
import PairedVoucherUpload from "./PairedVoucherUpload";
import styles from "./ProductCodeStockManager.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { addCodesForOption } from "../ProductCodeInventoryActions";
import { deleteAllUnsoldCodes, setProductStockMode } from "./actions";
type Option = { id: string; name: string; denomination: number | null; currency: string | null; availableCount: number };
export default function ProductCodeStockManager({ productId, isUnlimited, options, initialOptionId, revision }: { productId: string; isUnlimited: boolean; options: Option[]; initialOptionId?: string; revision: string }) {
  const [selectedId, setSelectedId] = useState(options.find(option => option.id === initialOptionId)?.id ?? options[0]?.id ?? "");
  const [entryFormat, setEntryFormat] = useState<"CODE" | "CARD_PIN">("CODE");
  const readVersion = useRef(0);
  const [readingFile, setReadingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const [newCodes, setNewCodes] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [importMethod, setImportMethod] = useState<"SINGLE" | "BULK">("BULK");
  const [sequentialTarget, setSequentialTarget] = useState(1);
  const [sequentialActive, setSequentialActive] = useState(false);
  const [currentCode, setCurrentCode] = useState("");
  const [stagedCodes, setStagedCodes] = useState<string[]>([]);
  const [showUploadedContent, setShowUploadedContent] = useState(false);
  const selected = options.find((option) => option.id === selectedId);
  const parsedCodes = useMemo(() => Array.from(new Set(newCodes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))), [newCodes]);
  const invalidCode = parsedCodes.some(code => code.length < 4 || code.length > 500);
  const sequentialComplete = sequentialActive && stagedCodes.length === sequentialTarget;
  useEffect(() => {
    setSequentialActive(false);
    setStagedCodes([]);
    setCurrentCode("");
  }, [selectedId]);
  function loadCodesFile(file?: File) {
    if (!file) return;
    const version = ++readVersion.current;
    setIsPreviewing(false);
    if (file.size > 5500000) { setReadingFile(false); setFileError("Choose a file smaller than 5.5 MB (up to 10,000 codes)."); return; }
    setReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (version !== readVersion.current) return;
      setReadingFile(false);
      try {
        const raw = String(reader.result ?? "");
        const records = file.name.toLowerCase().endsWith(".csv") ? parseVoucherCsvRecords(raw) : raw.split(/\r?\n/).map((value) => [value]);
        if (records[0]?.some((value) => /^(card[ _-]?number|pin)$/i.test(value.trim()))) {
          throw new Error("This CSV contains card numbers and PINs. Select Card number + PIN, then Upload CSV.");
        }
        const values = records.map((row) => row[0].trim()).filter((value) => value && value.toLowerCase() !== "voucher code");
        setNewCodes(values.join("\n"));
        setFileError("");
      } catch (error) {
        setNewCodes("");
        setFileError(error instanceof Error ? error.message : "Unable to read the stock file.");
      }
      setIsPreviewing(false);
    };
    reader.onerror = () => { if (version === readVersion.current) { setReadingFile(false); setFileError("Unable to read this file. Please try again."); } };
    reader.readAsText(file);
  }
  return <div className={styles.manager}>
    <details className="mb-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer py-2 text-sm font-bold">Stock: {isUnlimited ? "Unlimited / manual delivery" : "Voucher inventory"}</summary>
    <form action={setProductStockMode.bind(null, productId)} className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h2 className="text-xl font-black">Stock mode</h2>
      <p className="mt-1 text-sm text-slate-500">Choose one stock system for this product. The two modes cannot be active together.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border p-4 ${!isUnlimited ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}>
          <input type="radio" name="stock_mode" value="CODE_INVENTORY" defaultChecked={!isUnlimited} className="mr-3" />
          <span className="font-black">Voucher / Code Inventory</span>
          <span className="mt-1 block pl-6 text-sm text-slate-500">Upload voucher codes separately for every denomination.</span>
        </label>
        <label className={`cursor-pointer rounded-xl border p-4 ${isUnlimited ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <input type="radio" name="stock_mode" value="UNLIMITED" defaultChecked={isUnlimited} className="mr-3" />
          <span className="font-black">Unlimited Product</span>
          <span className="mt-1 block pl-6 text-sm text-slate-500">Every denomination stays available. Voucher upload is hidden and delivery is manual.</span>
        </label>
      </div>
      <AdminSubmitButton className="admin-save-action mt-4 rounded-xl px-6 py-3 font-black transition">Save stock mode</AdminSubmitButton>
    </form></details>

    {isUnlimited ? (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-black text-emerald-900">Unlimited stock is active</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">All active denominations are available without voucher inventory. Orders must be delivered manually from the order receipt page.</p>
      </div>
    ) : <div className="grid min-w-0 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
    <aside data-stock-denominations className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Denominations</p><div className="grid gap-1">{options.map((option) => <button key={option.id} type="button" onClick={() => { readVersion.current++; setReadingFile(false); setFileError(""); setSelectedId(option.id); setNewCodes(""); setIsPreviewing(false); setShowUploadedContent(false); }} aria-pressed={selectedId === option.id} data-empty={option.availableCount === 0} className={`${styles.denomination} flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm font-bold`}><span>{option.name}</span><span className={`${styles.count} shrink-0 rounded-full px-2 py-0.5 text-xs`} aria-label={option.availableCount === 0 ? "Out of stock" : `${option.availableCount} available codes`}>{option.availableCount === 0 ? "0 · Out of stock" : option.availableCount}</span></button>)}</div></aside>
    <section className="min-w-0">{selected ? <><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">{selected.name}</h2><p className="text-sm text-slate-500">{selected.availableCount} available</p></div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Voucher format">
        <button type="button" aria-pressed={entryFormat === "CODE"} onClick={() => setEntryFormat("CODE")} className={`rounded-lg border px-4 py-2 text-sm font-bold ${entryFormat === "CODE" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}>Code / bundle</button>
        <button type="button" aria-pressed={entryFormat === "CARD_PIN"} onClick={() => setEntryFormat("CARD_PIN")} className={`rounded-lg border px-4 py-2 text-sm font-bold ${entryFormat === "CARD_PIN" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}>Card + PIN</button>
      </div>
      {entryFormat === "CARD_PIN" ? <PairedVoucherUpload key={selected.id} productId={productId} optionId={selected.id} optionName={selected.name} /> : <>
      <div role="group" aria-label="Stock entry method" className="mt-3 flex gap-2">{(["BULK", "SINGLE"] as const).map(method => <button key={method} type="button" aria-pressed={importMethod === method} onClick={() => { readVersion.current++; setReadingFile(false); setFileError(""); setImportMethod(method); setIsPreviewing(false); }} className={`min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${importMethod === method ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}>{method === "BULK" ? "Bulk import" : "One by one"}</button>)}</div>
      {importMethod === "SINGLE" && <form action={addCodesForOption.bind(null, productId, selected.id, selected.id)} className="mt-5 rounded-xl border border-slate-200 p-4">
        <input type="hidden" name={`codes_${selected.id}`} value={stagedCodes.join("\u001e")} />
        <input type="hidden" name="entry_separator" value="RECORD_SEPARATOR" />
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-black">Sequential replenishment</p><p className="mt-1">Choose how many delivery bundles to add. A bundle may contain one code or multiple codes, such as four 1000-INR codes for one 4000-INR delivery.</p></div>
        {!sequentialActive ? <div className="mt-4 flex flex-wrap items-end gap-3"><label><span className="block text-sm font-bold">Number of delivery bundles</span><input type="number" min={1} max={10000} value={sequentialTarget} onChange={(event) => setSequentialTarget(Math.min(10000, Math.max(1, Number(event.target.value) || 1)))} className="mt-2 w-40 rounded-xl border border-slate-200 px-4 py-3" /></label><button type="button" onClick={() => { setSequentialActive(true); setStagedCodes([]); setCurrentCode(""); }} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white">Start adding</button><button type="button" onClick={() => setImportMethod("BULK")} className="rounded-xl border border-slate-300 px-6 py-3 font-black">Use bulk import</button></div> : <div className="mt-4"><div className="flex items-center justify-between gap-3"><p className="font-black">Delivery bundle content</p><p className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">Added {stagedCodes.length} of {sequentialTarget}</p></div>{!sequentialComplete && <><textarea value={currentCode} onChange={(event) => setCurrentCode(event.target.value)} rows={7} placeholder="Enter one or multiple codes, one code per line" className="mt-3 w-full whitespace-pre-wrap rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm" /><button type="button" onClick={() => { const code = currentCode.trim(); if (code.length < 4 || stagedCodes.includes(code)) return; setStagedCodes((codes) => [...codes, code]); setCurrentCode(""); }} disabled={currentCode.trim().length < 4 || currentCode.trim().length > 500 || stagedCodes.includes(currentCode.trim())} className="mt-3 rounded-xl bg-blue-600 px-7 py-3 font-black text-white disabled:opacity-50">Add bundle</button></>}{stagedCodes.length > 0 && <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="w-16 px-4 py-2">No.</th><th className="px-4 py-2">Bundle content to upload</th></tr></thead><tbody>{stagedCodes.slice(0, 200).map((code, index) => <tr key={`${code}-${index}`} className="border-t border-slate-100"><td className="px-4 py-2 text-slate-500">{index + 1}</td><td className="whitespace-pre-wrap break-all px-4 py-2 font-mono font-bold text-slate-900">{code}</td></tr>)}</tbody></table></div>}{sequentialComplete && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-black text-emerald-800">Review the preview (first 200 bundles) before uploading.</p><AdminSubmitButton pendingLabel="Uploading…" className="mt-3 rounded-xl bg-emerald-600 px-7 py-3 font-black text-white disabled:opacity-50">Confirm upload</AdminSubmitButton></div>}<button type="button" onClick={() => { setSequentialActive(false); setStagedCodes([]); setCurrentCode(""); }} className="mt-3 ml-3 rounded-xl border border-slate-300 px-6 py-3 font-black">Cancel</button></div>}
      </form>}
      <div className={importMethod === "SINGLE" ? "hidden" : "block"}>
      {readingFile && <p role="status" className="mt-3 text-sm text-slate-500">Reading file…</p>}
      {invalidCode && <p role="alert" className="mt-3 text-sm text-red-700">Every code must contain 4–500 characters.</p>}
      {fileError && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{fileError}</p>}
      <form action={addCodesForOption.bind(null, productId, selected.id, selected.id)} className="mt-5 rounded-xl border border-slate-200 p-4" onSubmit={(event) => { if (importMethod === "BULK" && !isPreviewing) { event.preventDefault(); setIsPreviewing(true); } }}><label className="mt-4 block"><span className="text-sm font-bold">{importMethod === "SINGLE" ? "Unique code" : "Paste codes"}</span><textarea name={`codes_${selected.id}`} value={newCodes} onChange={(event) => { readVersion.current++; setReadingFile(false); setFileError(""); const value = event.target.value; setNewCodes(importMethod === "SINGLE" ? value.replace(/[\r\n]+/g, "") : value); setIsPreviewing(false); }} rows={5} required placeholder={importMethod === "SINGLE" ? "Enter one voucher code" : "CODE-001\nCODE-002\nCODE-003"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm" /></label><details className="mt-3"><summary className="cursor-pointer py-2 text-sm text-slate-500">Optional note</summary><label className="block"><span className="sr-only">Note</span><input name={`code_note_${selected.id}`} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label></details><div className="mt-4 flex flex-wrap gap-3">{importMethod === "BULK" && <label className="cursor-pointer rounded-xl border border-blue-300 bg-blue-50 px-6 py-3 font-black text-blue-700 hover:bg-blue-100">Select CSV or TXT<input type="file" accept=".csv,.txt,text/plain,text/csv" className="hidden" onChange={(event) => loadCodesFile(event.target.files?.[0])} /></label>}<AdminSubmitButton pendingLabel="Uploading…" disabled={readingFile || Boolean(fileError) || invalidCode || parsedCodes.length === 0 || parsedCodes.length > (importMethod === "SINGLE" ? 1 : 10000)} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{importMethod === "SINGLE" ? "Add code" : isPreviewing ? `Confirm upload to ${selected.name} (${parsedCodes.length})` : `Preview (${parsedCodes.length})`}</AdminSubmitButton>{isPreviewing && <button type="button" onClick={() => setIsPreviewing(false)} className="rounded-xl border border-slate-300 px-6 py-3 font-black">Cancel preview</button>}</div>{parsedCodes.length > (importMethod === "SINGLE" ? 1 : 10000) && <p className="mt-3 font-bold text-red-600">{importMethod === "SINGLE" ? "Enter only one code in this mode." : "This import contains more than 10,000 codes."}</p>}{importMethod === "BULK" && isPreviewing && <div className="mt-5 overflow-hidden rounded-xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Confirm denomination</p><p className="mt-1 break-words text-lg font-black text-blue-800">{selected.name}</p>{selected.denomination !== null && <p className="text-sm font-semibold text-slate-700">{selected.denomination} {selected.currency}</p>}<p className="mt-2 text-sm font-bold text-slate-700">Preview of first 200 codes</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{parsedCodes.length} total</span></div><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-white text-slate-500"><tr><th className="w-20 px-4 py-2">No.</th><th className="px-4 py-2">Product content</th></tr></thead><tbody>{parsedCodes.slice(0, 200).map((code, index) => <tr key={`${code}-${index}`} className="border-t border-slate-100"><td className="px-4 py-2 text-slate-500">{index + 1}</td><td className="break-all px-4 py-2 font-mono">{code}</td></tr>)}</tbody></table></div></div>}</form>
      </div>
      </>}
      <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <summary className="cursor-pointer py-2 text-sm font-bold text-amber-950">Available-code backup and restore</summary>
        <p className="mt-1 text-sm text-amber-900">Download the available codes before deleting them. You can restore the same CSV with the bulk uploader below.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`/admin/products/${productId}/edit/stock/export?optionId=${encodeURIComponent(selected.id)}`} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">1. Download available codes ({selected.availableCount})</a>
          <form action={deleteAllUnsoldCodes.bind(null, productId, selected.id)} onSubmit={(event) => { if (!window.confirm(`Permanently delete ${selected.availableCount} available code(s) for ${selected.name}? Download the backup first. Sold, reserved, and disabled codes will not be changed.`)) event.preventDefault(); }}>
            <button disabled={selected.availableCount === 0} className="rounded-xl border border-red-300 bg-white px-5 py-3 font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-50">2. Delete available codes</button>
          </form>
        </div>
      </details>
      <button type="button" onClick={() => setShowUploadedContent((value) => !value)} className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left font-black text-slate-800">
        <span>{showUploadedContent ? "Hide uploaded content" : "Show uploaded content"}</span>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">10 per page</span>
      </button>
      {showUploadedContent && <UploadedProductCodes key={selected.id} productId={productId} optionId={selected.id} revision={revision} />}
    </> : <p>Create a product option first.</p>}</section>
    </div>}
  </div>;
}
