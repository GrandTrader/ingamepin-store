"use client";

import { useId, useRef, useState } from "react";
import { formatFaceValue } from "@/lib/face-value";
import {
  buildSupplierQuotation, quotationCsv, quotationDenomination, quotationFilename,
  quotationHtml, quotationMoney, quotationSelection, quotationText,
  type SupplierQuotation, type SupplierQuotationItem,
} from "@/lib/supplier-quotation";

const button = "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50";
const field = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export default function SupplierQuotationBuilder({ orderNumber, items }: {
  orderNumber: string;
  items: SupplierQuotationItem[];
}) {
  const panelId = useId();
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(() => quotationSelection(items, "remaining"));
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState("0");
  const [preview, setPreview] = useState<SupplierQuotation | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const groups = new Map<string, SupplierQuotationItem[]>();
  for (const item of items) {
    const key = JSON.stringify([item.productName, item.platform]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const selected = items.filter(item => selection[item.id]?.selected);
  let estimate: SupplierQuotation | null = null;
  try {
    estimate = buildSupplierQuotation(orderNumber, items, selection, supplier, note, new Date(), discount);
  } catch {
    // Preview reports invalid selections or discounts; never show partial totals.
  }
  const prices = new Map(estimate?.lines.map(line => [line.id, line]) ?? []);
  function invalidate() {
    setPreview(null);
    setError("");
    setMessage("");
  }
  function selectGroup(mode: "remaining" | "all" | "none") {
    setSelection(quotationSelection(items, mode));
    invalidate();
  }
  function createPreview() {
    setError("");
    setMessage("");
    try {
      setPreview(buildSupplierQuotation(orderNumber, items, selection, supplier, note, new Date(), discount));
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "Unable to create the quotation.");
    }
  }
  async function copy() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(quotationText(preview));
      setMessage("Quotation copied. You can paste it into your supplier chat or email.");
    } catch {
      previewRef.current?.focus();
      previewRef.current?.select();
      setMessage("Select and copy the quotation text below.");
    }
  }
  function downloadCsv() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([quotationCsv(preview)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = quotationFilename(preview) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setMessage("Quotation CSV downloaded.");
  }
  function print() {
    if (!preview) return;
    const tab = window.open("", "_blank");
    if (!tab) {
      setMessage("Allow pop-ups for this website to open the printable quotation.");
      return;
    }
    // Print a separate, escaped document so customer details and voucher codes
    // from the order receipt can never appear in the supplier PDF.
    tab.opener = null;
    tab.document.open();
    tab.document.write(quotationHtml(preview));
    tab.document.close();
    const printButton = tab.document.getElementById("print-quotation");
    if (printButton) printButton.onclick = () => tab.print();
    tab.focus();
    tab.print();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">Purchased products</h2>
        <button type="button" aria-expanded={open} aria-controls={panelId}
          className={button} onClick={() => setOpen(!open)}>
          {open ? "Close quotation" : "Create supplier quotation"}
        </button>
      </div>
      <div id={panelId} hidden={!open}>
        {open && (
          <section aria-label="Supplier quotation builder" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-5">
            <h3 className="text-base font-black text-slate-900">Supplier quotation</h3>
            <p className="mt-1 text-sm text-slate-600">Select denominations and quantities to request a supplier quote. Remaining items are selected first.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold text-slate-700">Supplier name (optional)
                <input className={field} value={supplier} maxLength={160} placeholder="Supplier or company name"
                  onChange={event => { setSupplier(event.target.value); invalidate(); }} />
              </label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Note to supplier (optional)
                <textarea className={field} value={note} maxLength={2000} rows={2} placeholder="Delivery time or other requirements"
                  onChange={event => { setNote(event.target.value); invalidate(); }} />
              </label>
            </div>
            <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid w-40 gap-1 text-sm font-bold text-slate-700">Supplier discount (%)
                  <input type="number" min={0} max={100} step="0.01" inputMode="decimal" className={field}
                    value={discount} onChange={event => { setDiscount(event.target.value); invalidate(); }} />
                </label>
                <p className="max-w-md text-xs text-slate-500">Applied to the face value of all selected denominations. Amounts round to two decimal places per line.</p>
              </div>
              <dl aria-label="Quotation totals" className="mt-3 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Total face value</dt><dd className="mt-1 break-words text-sm font-bold">{estimate?.faceValue ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Discount amount</dt><dd className="mt-1 break-words text-sm font-bold text-emerald-700">{estimate?.discountAmount ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Supplier total after discount</dt><dd className="mt-1 break-words text-base font-black text-blue-800">{estimate?.supplierTotal ?? "—"}</dd></div>
              </dl>
            </div>
            <div className="my-3 flex flex-wrap items-center gap-2">
              <button type="button" className={button} onClick={() => selectGroup("remaining")}>Select remaining</button>
              <button type="button" className={button} onClick={() => selectGroup("all")}>Select all</button>
              <button type="button" className={button} onClick={() => selectGroup("none")}>Clear</button>
              <span className="text-sm text-slate-600">{selected.length} of {items.length} selected</span>
            </div>
            <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {[...groups].map(([key, group]) => (
                <div key={key}>
                  <h4 className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">
                    {group[0].productName}{group[0].platform ? " · " + group[0].platform : ""}
                  </h4>
                  {group.map(item => {
                const value = selection[item.id] ?? { selected: false, quantity: String(item.quantity) };
                const price = prices.get(item.id);
                return (
                  <div key={item.id} className={"grid grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-3 border-b border-slate-200 p-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_6rem_10rem] " + (value.selected ? "bg-blue-50/50" : "")}>
                    <label className="flex min-h-10 min-w-0 cursor-pointer items-start gap-3">
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-600" checked={value.selected}
                        aria-label={"Include " + item.productName + " " + item.optionName}
                        onChange={event => {
                          setSelection({ ...selection, [item.id]: { ...value, selected: event.target.checked } });
                          invalidate();
                        }} />
                      <span className="min-w-0 break-words text-sm">
                        <strong className="block text-blue-800">{quotationDenomination(item)}</strong>
                        <span className="mt-1 block text-xs text-slate-500">{item.remainingQuantity} remaining · {item.quantity} ordered</span>
                      </span>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-600">Quantity
                      <input type="number" inputMode="numeric" min={1} max={item.quantity} step={1}
                        aria-label={"Quantity for " + item.productName + " " + item.optionName}
                        className={field + " disabled:bg-slate-100 disabled:text-slate-400"}
                        disabled={!value.selected} value={value.quantity}
                        onChange={event => {
                          setSelection({ ...selection, [item.id]: { ...value, quantity: event.target.value } });
                          invalidate();
                        }} />
                    </label>
                    <div className="col-span-2 text-right text-xs text-slate-500 sm:col-span-1 sm:pt-1">
                      Face value
                      <strong className="ml-2 text-sm text-slate-900 sm:ml-0 sm:mt-2 sm:block">
                        {value.selected && /^[1-9]\d*$/.test(value.quantity) && Number(value.quantity) <= item.quantity
                          ? formatFaceValue([{ ...item, quantity: Number(value.quantity) }]) : "—"}
                      </strong>
                      {price && <span className="mt-1 block text-xs text-blue-800">Supplier total: <strong>{quotationMoney(price.supplierTotalMinor, price.denominationCurrency)}</strong></span>}
                    </div>
                  </div>
                );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Quotation prices use your supplier discount. Your customer prices and order stay unchanged.</p>
            {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
            <button type="button" className="mt-3 min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              onClick={createPreview}>Preview quotation</button>
            {preview && (
              <section aria-label="Quotation preview" className="mt-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h4 className="font-bold">Ready to share</h4><p className="mt-1 text-sm text-slate-600">{preview.totalQuantity} units · Supplier total: {preview.supplierTotal}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={button} onClick={copy}>Copy quotation</button>
                    <button type="button" className={button} onClick={downloadCsv}>Download CSV</button>
                    <button type="button" className={button} onClick={print}>Print / Save PDF</button>
                  </div>
                </div>
                <textarea ref={previewRef} aria-label="Quotation text" readOnly value={quotationText(preview)}
                  className="mt-3 h-64 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800" />
              </section>
            )}
            <p role="status" className="mt-2 text-sm text-blue-800">{message}</p>
          </section>
        )}
      </div>
    </div>
  );
}
