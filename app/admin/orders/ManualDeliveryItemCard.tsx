"use client";

import { useState } from "react";
import { completeManualOrder, sendManualOrderItem } from "./actions";

export default function ManualDeliveryItemCard({ orderId, item }: { orderId: string; item: { id: string; product_name: string; option_name: string | null; quantity: number; delivered_count?: number; is_bulk_order?: boolean } }) {
  const [codes, setCodes] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const deliveredCount = Math.max(0, Number(item.delivered_count ?? 0));
  const remainingQuantity = Math.max(0, item.quantity - deliveredCount);
  const enteredCodes = codes.split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
  const enteredCodeCount = enteredCodes.length;
  const invalidCodeCount =
    enteredCodeCount < 1 ||
    enteredCodeCount > remainingQuantity ||
    (!item.is_bulk_order && enteredCodeCount !== remainingQuantity);
  function loadCsv(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const values = String(reader.result ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(",")[0].replace(/^"|"$/g, "").replaceAll('""', '"')).filter((value) => value.toLowerCase() !== "voucher code");
      setCodes(values.join("\n"));
      setShowConfirmation(false);
    };
    reader.readAsText(file);
  }
  return <article className="rounded-xl border border-blue-200 bg-white p-3">
    <p className="line-clamp-2 font-black text-slate-800">{item.product_name}{item.option_name ? ` · ${item.option_name}` : ""}</p>
    <p className="mt-1 text-xs text-slate-500">
      {item.is_bulk_order
        ? `${remainingQuantity} of ${item.quantity} code(s) remaining. Upload no more than the remaining quantity.`
        : `Enter exactly ${remainingQuantity} remaining code${remainingQuantity === 1 ? "" : "s"}, one per line.`}
    </p>
    <form
      id={`send-${item.id}`}
      action={sendManualOrderItem}
      onSubmit={(event) => {
        if (!showConfirmation) {
          event.preventDefault();
          setShowConfirmation(true);
        }
      }}
      className="mt-3 grid gap-2"
    >
      <input type="hidden" name="order_id" value={orderId} /><input type="hidden" name="item_id" value={item.id} />
      <label className="text-xs font-bold text-slate-600">CSV file<input type="file" accept=".csv,.txt" onChange={(event) => loadCsv(event.target.files?.[0])} className="mt-1 block w-full rounded-lg border border-blue-200 bg-blue-50 text-xs text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white hover:file:bg-blue-500" /></label>
      <textarea name="codes" value={codes} onChange={(event) => { setCodes(event.target.value); setShowConfirmation(false); }} rows={4} required placeholder="One code per line" className="w-full resize-y rounded-lg border border-blue-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500" />
    </form>
    <p className={`mt-2 text-xs font-bold ${enteredCodeCount > remainingQuantity ? "text-red-600" : "text-slate-500"}`}>
      Entered: {enteredCodeCount} / Remaining: {remainingQuantity}
    </p>
    <button form={`send-${item.id}`} disabled={invalidCodeCount} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300">Review codes before sending</button>
    <div className="my-3 flex items-center gap-3 text-[11px] font-black uppercase tracking-wider text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
    </div>
    <form
      action={completeManualOrder}
      onSubmit={(event) => {
        if (!window.confirm("Confirm that the UID/account purchase has been completed for this customer?")) event.preventDefault();
      }}
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="service_item_id" value={item.id} />
      <button className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-500">
        Confirm UID / account purchase delivered
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-500">Use for UID top-ups, account purchases, or activation services such as GTA 6.</p>
    </form>
    {showConfirmation && (
      <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby={`confirm-codes-${item.id}`}>
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 id={`confirm-codes-${item.id}`} className="text-xl font-black text-slate-900">Confirm all delivery codes</h2>
            <p className="mt-1 text-sm text-slate-600">Check every code below. Nothing is sent until you click Confirm and send.</p>
            <p className="mt-2 font-bold text-blue-700">{item.product_name}{item.option_name ? ` · ${item.option_name}` : ""} · {enteredCodeCount} code{enteredCodeCount === 1 ? "" : "s"}</p>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {enteredCodes.map((code, index) => (
              <li key={`${code}-${index}`} className="grid grid-cols-[3rem_1fr] gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-right font-bold text-slate-400">{index + 1}.</span>
                <span className="break-all font-mono text-slate-900">{code}</span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <button type="button" onClick={() => setShowConfirmation(false)} className="rounded-xl border border-slate-300 px-4 py-3 font-black text-slate-700">Back and edit</button>
            <button form={`send-${item.id}`} type="submit" className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-500">Confirm and send</button>
          </div>
        </div>
      </div>
    )}
  </article>;
}
