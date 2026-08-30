"use client";
import { useEffect, useMemo, useState } from "react";
import { addCodesForOption, changeCodeStatusForOption, deleteProductCode } from "../ProductCodeInventoryActions";
import { deleteAllUnsoldCodes, setProductStockMode } from "./actions";
type Option = { id: string; name: string; denomination: number | null; currency: string | null; availableCount: number };
type Code = { id: string; code: string; optionId: string | null; status: "AVAILABLE" | "RESERVED" | "SOLD" | "DISABLED"; createdAt: string };
export default function ProductCodeStockManager({ productId, isUnlimited, options, codes }: { productId: string; isUnlimited: boolean; options: Option[]; codes: Code[] }) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [newCodes, setNewCodes] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [importMethod, setImportMethod] = useState<"SINGLE" | "BULK">("BULK");
  const [sequentialTarget, setSequentialTarget] = useState(1);
  const [sequentialActive, setSequentialActive] = useState(false);
  const [currentCode, setCurrentCode] = useState("");
  const [stagedCodes, setStagedCodes] = useState<string[]>([]);
  const [showUploadedContent, setShowUploadedContent] = useState(false);
  const selected = options.find((option) => option.id === selectedId);
  const selectedCodes = useMemo(() => codes.filter((code) => code.optionId === selectedId), [codes, selectedId]);
  const parsedCodes = useMemo(() => Array.from(new Set(newCodes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))), [newCodes]);
  const sequentialComplete = sequentialActive && stagedCodes.length === sequentialTarget;
  useEffect(() => {
    setSequentialActive(false);
    setStagedCodes([]);
    setCurrentCode("");
  }, [selectedId]);
  const pageCount = Math.max(1, Math.ceil(selectedCodes.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleCodes = selectedCodes.slice((currentPage - 1) * 10, currentPage * 10);
  function loadCodesFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const values = String(reader.result ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(",")[0].replace(/^"|"$/g, "").replaceAll('""', '"'))
        .filter((value) => value.toLowerCase() !== "voucher code");
      setNewCodes(values.join("\n"));
      setIsPreviewing(false);
    };
    reader.readAsText(file);
  }
  return <div>
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
      <button className="admin-save-action mt-4 rounded-xl px-6 py-3 font-black transition">Save stock mode</button>
    </form>

    {isUnlimited ? (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-black text-emerald-900">Unlimited stock is active</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">All active denominations are available without voucher inventory. Orders must be delivered manually from the order receipt page.</p>
      </div>
    ) : <div className="grid min-h-[520px] gap-5 lg:grid-cols-[230px_1fr]">
    <aside className="rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Denominations</p><div className="grid gap-1">{options.map((option) => <button key={option.id} type="button" onClick={() => { setSelectedId(option.id); setPage(1); setNewCodes(""); setIsPreviewing(false); setShowUploadedContent(false); }} className={`flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-bold ${selectedId === option.id ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}><span>{option.name}</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{option.availableCount}</span></button>)}</div></aside>
    <section>{selected ? <><div><h2 className="text-xl font-black">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.availableCount} available voucher codes</p></div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-black text-amber-950">Available-code backup and restore</h3>
        <p className="mt-1 text-sm text-amber-900">Download the available codes before deleting them. You can restore the same CSV with the bulk uploader below.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`/admin/products/${productId}/edit/stock/export?optionId=${encodeURIComponent(selected.id)}`} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">1. Download available codes ({selected.availableCount})</a>
          <form action={deleteAllUnsoldCodes.bind(null, productId, selected.id)} onSubmit={(event) => { if (!window.confirm(`Permanently delete ${selected.availableCount} available code(s) for ${selected.name}? Download the backup first. Sold, reserved, and disabled codes will not be changed.`)) event.preventDefault(); }}>
            <button disabled={selected.availableCount === 0} className="rounded-xl border border-red-300 bg-white px-5 py-3 font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-50">2. Delete available codes</button>
          </form>
        </div>
      </div>
      {importMethod === "SINGLE" && <form action={addCodesForOption.bind(null, productId, selected.id, selected.id)} className="mt-5 rounded-xl border border-slate-200 p-4">
        <input type="hidden" name={`codes_${selected.id}`} value={stagedCodes.join("\u001e")} />
        <input type="hidden" name="entry_separator" value="RECORD_SEPARATOR" />
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-black">Sequential replenishment</p><p className="mt-1">Choose how many delivery bundles to add. A bundle may contain one code or multiple codes, such as four 1000-INR codes for one 4000-INR delivery.</p></div>
        {!sequentialActive ? <div className="mt-4 flex flex-wrap items-end gap-3"><label><span className="block text-sm font-bold">Number of delivery bundles</span><input type="number" min={1} max={10000} value={sequentialTarget} onChange={(event) => setSequentialTarget(Math.min(10000, Math.max(1, Number(event.target.value) || 1)))} className="mt-2 w-40 rounded-xl border border-slate-200 px-4 py-3" /></label><button type="button" onClick={() => { setSequentialActive(true); setStagedCodes([]); setCurrentCode(""); }} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white">Start adding</button><button type="button" onClick={() => setImportMethod("BULK")} className="rounded-xl border border-slate-300 px-6 py-3 font-black">Use bulk import</button></div> : <div className="mt-4"><div className="flex items-center justify-between gap-3"><p className="font-black">Delivery bundle content</p><p className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">Added {stagedCodes.length} of {sequentialTarget}</p></div>{!sequentialComplete && <><textarea value={currentCode} onChange={(event) => setCurrentCode(event.target.value)} rows={7} placeholder="Enter one or multiple codes, one code per line" className="mt-3 w-full whitespace-pre-wrap rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm" /><button type="button" onClick={() => { const code = currentCode.trim(); if (code.length < 4 || stagedCodes.includes(code)) return; setStagedCodes((codes) => [...codes, code]); setCurrentCode(""); }} disabled={currentCode.trim().length < 4 || stagedCodes.includes(currentCode.trim())} className="mt-3 rounded-xl bg-blue-600 px-7 py-3 font-black text-white disabled:opacity-50">Add bundle</button></>}{stagedCodes.length > 0 && <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="w-16 px-4 py-2">No.</th><th className="px-4 py-2">Bundle content to upload</th></tr></thead><tbody>{stagedCodes.map((code, index) => <tr key={`${code}-${index}`} className="border-t border-slate-100"><td className="px-4 py-2 text-slate-500">{index + 1}</td><td className="whitespace-pre-wrap break-all px-4 py-2 font-mono font-bold text-slate-900">{code}</td></tr>)}</tbody></table></div>}{sequentialComplete && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-black text-emerald-800">Review every bundle above before uploading.</p><button type="submit" className="mt-3 rounded-xl bg-emerald-600 px-7 py-3 font-black text-white">Confirm upload</button></div>}<button type="button" onClick={() => { setSequentialActive(false); setStagedCodes([]); setCurrentCode(""); }} className="mt-3 ml-3 rounded-xl border border-slate-300 px-6 py-3 font-black">Cancel</button></div>}
      </form>}
      <div className={importMethod === "SINGLE" ? "hidden" : "block"}>
      <form action={addCodesForOption.bind(null, productId, selected.id, selected.id)} className="mt-5 rounded-xl border border-slate-200 p-4" onSubmit={(event) => { if (importMethod === "BULK" && !isPreviewing) { event.preventDefault(); setIsPreviewing(true); } }}><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-black">Choose stock entry method</p><p className="mt-1">Add one unique code manually or import a larger list for this denomination.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => { setImportMethod("SINGLE"); setNewCodes(""); setIsPreviewing(false); }} className={`rounded-xl border p-4 text-left ${importMethod === "SINGLE" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><span className="block font-black">Add one code</span><span className="mt-1 block text-sm text-slate-500">Enter one unique voucher or access code.</span></button><button type="button" onClick={() => { setImportMethod("BULK"); setNewCodes(""); setIsPreviewing(false); }} className={`rounded-xl border p-4 text-left ${importMethod === "BULK" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><span className="block font-black">Bulk import / restore backup</span><span className="mt-1 block text-sm text-slate-500">Paste codes or upload a TXT/CSV file, including a downloaded backup.</span></button></div><label className="mt-4 block"><span className="text-sm font-bold">{importMethod === "SINGLE" ? "Unique code" : "Paste codes"}</span><textarea name={`codes_${selected.id}`} value={newCodes} onChange={(event) => { const value = event.target.value; setNewCodes(importMethod === "SINGLE" ? value.replace(/[\r\n]+/g, "") : value); setIsPreviewing(false); }} rows={importMethod === "SINGLE" ? 4 : 8} required placeholder={importMethod === "SINGLE" ? "Enter one voucher code" : "CODE-001\nCODE-002\nCODE-003"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm" /></label><label className="mt-4 block"><span className="text-sm font-bold">Note</span><input name={`code_note_${selected.id}`} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><div className="mt-4 flex flex-wrap gap-3">{importMethod === "BULK" && <label className="cursor-pointer rounded-xl border border-blue-300 bg-blue-50 px-6 py-3 font-black text-blue-700 hover:bg-blue-100">3. Select backup CSV or TXT<input type="file" accept=".csv,.txt,text/plain,text/csv" className="hidden" onChange={(event) => loadCodesFile(event.target.files?.[0])} /></label>}<button type="submit" disabled={parsedCodes.length === 0 || parsedCodes.length > (importMethod === "SINGLE" ? 1 : 10000)} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{importMethod === "SINGLE" ? "Add code" : isPreviewing ? `Confirm upload (${parsedCodes.length})` : `Preview (${parsedCodes.length})`}</button>{isPreviewing && <button type="button" onClick={() => setIsPreviewing(false)} className="rounded-xl border border-slate-300 px-6 py-3 font-black">Cancel preview</button>}</div>{parsedCodes.length > (importMethod === "SINGLE" ? 1 : 10000) && <p className="mt-3 font-bold text-red-600">{importMethod === "SINGLE" ? "Enter only one code in this mode." : "This import contains more than 10,000 codes."}</p>}{importMethod === "BULK" && isPreviewing && <div className="mt-5 overflow-hidden rounded-xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><p className="font-black">Preview of first 200 codes</p><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{parsedCodes.length} total</span></div><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-white text-slate-500"><tr><th className="w-20 px-4 py-2">No.</th><th className="px-4 py-2">Product content</th></tr></thead><tbody>{parsedCodes.slice(0, 200).map((code, index) => <tr key={`${code}-${index}`} className="border-t border-slate-100"><td className="px-4 py-2 text-slate-500">{index + 1}</td><td className="break-all px-4 py-2 font-mono">{code}</td></tr>)}</tbody></table></div></div>}</form>
      </div>
      <button type="button" onClick={() => setShowUploadedContent((value) => !value)} className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left font-black text-slate-800">
        <span>{showUploadedContent ? "Hide uploaded content" : "Show uploaded content"}</span>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">{selectedCodes.length}</span>
      </button>
      {showUploadedContent && <div className="mt-4">
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Voucher code</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Added</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{visibleCodes.map((code) => <tr key={code.id} className="border-t border-slate-200"><td className="px-4 py-3 font-mono">{code.code}</td><td className="px-4 py-3">{code.status}</td><td className="px-4 py-3 text-slate-500">{new Date(code.createdAt).toLocaleString()}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{(code.status === "AVAILABLE" || code.status === "DISABLED") && <><form action={changeCodeStatusForOption.bind(null, productId, code.id, code.status === "AVAILABLE" ? "DISABLED" : "AVAILABLE")}><button className="rounded-lg border px-3 py-2 font-bold">{code.status === "AVAILABLE" ? "Disable" : "Enable"}</button></form><form action={deleteProductCode.bind(null, productId, code.id)}><button className="rounded-lg border border-red-200 px-3 py-2 font-bold text-red-600">Delete</button></form></>}</div></td></tr>)}</tbody></table></div>
        {pageCount > 1 && <div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`rounded-lg border px-3 py-2 font-bold ${currentPage === number ? "bg-blue-600 text-white" : "bg-white"}`}>{number}</button>)}</div>}
      </div>}
    </> : <p>Create a product option first.</p>}</section>
    </div>}
  </div>;
}
