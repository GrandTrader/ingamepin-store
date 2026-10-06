"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { addCodesForOption } from "../ProductCodeInventoryActions";
import { PAIRED_VOUCHER_CSV_TEMPLATE, parsePairedVoucherCsv, validatePairedVouchers, type PairedVoucher } from "@/lib/paired-voucher-import";

function UploadButton({ count, previewing, disabled }: { count: number; previewing: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{pending ? "Uploading..." : previewing ? `Confirm upload (${count})` : `Preview (${count})`}</button>;
}

export default function PairedVoucherUpload({ productId, optionId, optionName }: { productId: string; optionId: string; optionName: string }) {
  const [method, setMethod] = useState<"MANUAL" | "CSV">("MANUAL");
  const [cardNumber, setCardNumber] = useState("");
  const [pin, setPin] = useState("");
  const [rows, setRows] = useState<PairedVoucher[]>([]);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [reading, setReading] = useState(false);
  const readVersion = useRef(0);
  function changeMethod(value: "MANUAL" | "CSV") {
    readVersion.current++;
    setMethod(value); setRows([]); setCardNumber(""); setPin(""); setError(""); setPreviewing(false); setReading(false);
  }
  function addCard() {
    try {
      setRows(validatePairedVouchers([...rows, { cardNumber, pin }]));
      setCardNumber(""); setPin(""); setError(""); setPreviewing(false);
    } catch (cause) { setError((cause as Error).message); }
  }
  async function loadCsv(file?: File) {
    if (!file) return;
    const version = ++readVersion.current;
    setPreviewing(false); setRows([]); setError(""); setReading(true);
    try {
      if (file.size > 1000000) throw new Error("CSV must be smaller than 1 MB. Split it into smaller files.");
      const parsed = parsePairedVoucherCsv(await file.text());
      if (version === readVersion.current) setRows(parsed);
    } catch (cause) {
      if (version === readVersion.current) setError(cause instanceof Error ? cause.message : "Unable to read CSV. Try again.");
    } finally { if (version === readVersion.current) setReading(false); }
  }
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm";
  return <form action={addCodesForOption.bind(null, productId, optionId, optionId)} onSubmit={(event) => {
    if (cardNumber.trim() || pin.trim()) { event.preventDefault(); setError("Click Add card to include the current card number and PIN first."); return; }
    if (reading || rows.length === 0) { event.preventDefault(); return; }
    try { validatePairedVouchers(rows); } catch (cause) { event.preventDefault(); setError((cause as Error).message); return; }
    if (!previewing) { event.preventDefault(); setPreviewing(true); setError(""); }
  }} className="mt-4 min-w-0 rounded-xl border border-slate-200 p-4">
    <input type="hidden" name="stock_entry_format" value="CARD_PIN" />
    <input type="hidden" name={`codes_${optionId}`} value={JSON.stringify(rows)} />
    <h3 className="font-black">Card number + PIN</h3>
    <p className="mt-1 text-sm text-slate-600">Each pair counts as one voucher. The customer receives both together.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {(["MANUAL", "CSV"] as const).map((value) => <button key={value} type="button" aria-pressed={method === value} onClick={() => changeMethod(value)} className={`rounded-lg border px-4 py-2 text-sm font-bold ${method === value ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}>{value === "MANUAL" ? "Enter cards" : "Upload CSV"}</button>)}
    </div>
    {method === "MANUAL" ? <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <label className="min-w-0 text-sm font-bold">Card number<input type="text" autoComplete="off" maxLength={200} value={cardNumber} onChange={(event) => { setCardNumber(event.target.value); setPreviewing(false); }} className={inputClass} /></label>
      <label className="min-w-0 text-sm font-bold">PIN<input type="text" autoComplete="off" maxLength={200} value={pin} onChange={(event) => { setPin(event.target.value); setPreviewing(false); }} className={inputClass} /></label>
      <button type="button" onClick={addCard} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 font-bold text-blue-800">Add card</button>
    </div> : <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
      <p>Use two columns: <strong>card_number,pin</strong>. One voucher per row.</p>
      <p className="mt-1 text-slate-600">In Excel, format both columns as Text before entering values to preserve leading zeros and long card numbers.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a download="card-number-pin-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(PAIRED_VOUCHER_CSV_TEMPLATE)}`} className="font-bold text-blue-700 underline">Download CSV template</a>
        <label className="min-w-0 font-bold">Select CSV file<input type="file" accept=".csv,text/csv" className="mt-1 block w-full max-w-full text-sm" onChange={(event) => { void loadCsv(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div>
      {reading && <p role="status" className="mt-2">Reading CSV...</p>}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
    {rows.length > 0 && <div className="mt-4">
      <p className="text-sm font-bold">{previewing ? "Confirm denomination" : "Selected denomination"}: {optionName}</p>
      <p className="mt-1 text-sm text-slate-600">{rows.length} voucher(s) — {previewing ? "review both columns before confirming" : "click Preview before uploading"}.{rows.length > 200 ? " Showing the first 200." : ""}</p>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full table-fixed text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="px-3 py-2">Card number</th><th className="px-3 py-2">PIN</th><th className="w-20 px-2 py-2"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.slice(0, 200).map((row, index) => <tr key={row.cardNumber} className="border-t border-slate-200"><td className="break-all px-3 py-2 font-mono">{row.cardNumber}</td><td className="break-all px-3 py-2 font-mono">{row.pin}</td><td className="px-2 py-2"><button type="button" aria-label={`Remove row ${index + 1}`} className="text-red-700" onClick={() => { setRows(rows.filter((_, rowIndex) => rowIndex !== index)); setPreviewing(false); setError(""); }}>Remove</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>}
    <label className="mt-4 block text-sm font-bold">Note (optional)<input name={`code_note_${optionId}`} className={inputClass} /></label>
    <div className="mt-3 flex flex-wrap gap-3"><UploadButton count={rows.length} previewing={previewing} disabled={!rows.length || reading} />{previewing && <button type="button" onClick={() => setPreviewing(false)} className="rounded-lg border px-4 py-2 text-sm font-bold">Back to editing</button>}</div>
  </form>;
}
