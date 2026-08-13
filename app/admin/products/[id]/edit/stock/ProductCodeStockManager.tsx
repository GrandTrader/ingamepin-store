"use client";
import { useMemo, useState } from "react";
import { addCodesForOption, changeCodeStatusForOption, deleteProductCode } from "../ProductCodeInventoryActions";
import { deleteAllUnsoldCodes, setProductStockMode } from "./actions";
type Option = { id: string; name: string; denomination: number | null; currency: string | null };
type Code = { id: string; code: string; optionId: string | null; status: "AVAILABLE" | "RESERVED" | "SOLD" | "DISABLED"; createdAt: string };
export default function ProductCodeStockManager({ productId, isUnlimited, options, codes }: { productId: string; isUnlimited: boolean; options: Option[]; codes: Code[] }) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [newCodes, setNewCodes] = useState("");
  const [showUploadedContent, setShowUploadedContent] = useState(false);
  const selected = options.find((option) => option.id === selectedId);
  const selectedCodes = useMemo(() => codes.filter((code) => code.optionId === selectedId), [codes, selectedId]);
  const availableCodes = selectedCodes.filter((code) => code.status === "AVAILABLE");
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
    <aside className="rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Denominations</p><div className="grid gap-1">{options.map((option) => { const count = codes.filter((code) => code.optionId === option.id && code.status === "AVAILABLE").length; return <button key={option.id} type="button" onClick={() => { setSelectedId(option.id); setPage(1); setNewCodes(""); setShowUploadedContent(false); }} className={`flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-bold ${selectedId === option.id ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}><span>{option.name}</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{count}</span></button>; })}</div></aside>
    <section>{selected ? <><div><h2 className="text-xl font-black">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{availableCodes.length} available voucher codes</p></div>
      <form action={addCodesForOption.bind(null, productId, selected.id, selected.id)} className="mt-5 rounded-xl border border-slate-200 p-4"><label><span className="text-sm font-bold">Voucher codes</span><textarea name={`codes_${selected.id}`} value={newCodes} onChange={(event) => setNewCodes(event.target.value)} rows={8} required placeholder="One voucher code per line" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm" /></label><label className="mt-4 block"><span className="text-sm font-bold">Note</span><input name={`code_note_${selected.id}`} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><div className="mt-4 flex flex-wrap gap-3"><label className="cursor-pointer rounded-xl border border-blue-300 bg-blue-50 px-6 py-3 font-black text-blue-700 hover:bg-blue-100">Upload codes<input type="file" accept=".csv,.txt" className="hidden" onChange={(event) => loadCodesFile(event.target.files?.[0])} /></label><button className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white">Save</button><a href={`/admin/products/${productId}/edit/stock/export?optionId=${encodeURIComponent(selected.id)}`} className="rounded-xl border border-emerald-300 px-5 py-3 font-bold text-emerald-700">Generate CSV for selected denomination</a></div></form>
      <button type="button" onClick={() => setShowUploadedContent((value) => !value)} className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left font-black text-slate-800">
        <span>{showUploadedContent ? "Hide uploaded content" : "Show uploaded content"}</span>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">{selectedCodes.length}</span>
      </button>
      {showUploadedContent && <div className="mt-4">
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Voucher code</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Added</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{visibleCodes.map((code) => <tr key={code.id} className="border-t border-slate-200"><td className="px-4 py-3 font-mono">{code.code}</td><td className="px-4 py-3">{code.status}</td><td className="px-4 py-3 text-slate-500">{new Date(code.createdAt).toLocaleString()}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{(code.status === "AVAILABLE" || code.status === "DISABLED") && <><form action={changeCodeStatusForOption.bind(null, productId, code.id, code.status === "AVAILABLE" ? "DISABLED" : "AVAILABLE")}><button className="rounded-lg border px-3 py-2 font-bold">{code.status === "AVAILABLE" ? "Disable" : "Enable"}</button></form><form action={deleteProductCode.bind(null, productId, code.id)}><button className="rounded-lg border border-red-200 px-3 py-2 font-bold text-red-600">Delete</button></form></>}</div></td></tr>)}</tbody></table></div>
        {pageCount > 1 && <div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`rounded-lg border px-3 py-2 font-bold ${currentPage === number ? "bg-blue-600 text-white" : "bg-white"}`}>{number}</button>)}</div>}
        <form action={deleteAllUnsoldCodes.bind(null, productId, selected.id)} onSubmit={(event) => { if (!window.confirm(`Delete all unsold voucher codes for ${selected.name}? This cannot be undone.`)) event.preventDefault(); }}><button className="mt-6 rounded-xl border border-red-300 px-5 py-3 font-bold text-red-600">Delete unsold codes for {selected.name}</button></form>
      </div>}
    </> : <p>Create a product option first.</p>}</section>
    </div>}
  </div>;
}
