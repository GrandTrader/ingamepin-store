"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { DELIVERY_RECEIPT_MAX_BYTES } from "@/lib/delivery-receipt-file";
import { useRouter } from "next/navigation";
import { completeManualOrder } from "./actions";

export default function ManualDeliveryItemCard({ orderId, item }: { orderId: string; item: { id: string; product_name: string; option_name: string | null; quantity: number; delivered_count?: number; is_bulk_order?: boolean; service_only?: boolean } }) {
  const [method, setMethod] = useState(item.service_only ? "service" : "codes");
  const [codes, setCodes] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [reviewPage, setReviewPage] = useState(0);
  const [savedRemaining, setSavedRemaining] = useState<number | null>(null);
  const router = useRouter();
  const [, confirmService, isCompleting] = useActionState(async (_state: null, formData: FormData) => {
    await completeManualOrder(formData);
    return null;
  }, null);
  const [result, sendCodes, isSending] = useActionState(async (_state: {error: string; success: string}, formData: FormData) => {
    try {
      // Stable URL: an open delivery form remains usable across new deployments.
      const response = await fetch("/api/admin/orders/delivery", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({orderId: formData.get("order_id"), itemId: formData.get("item_id"), codes: formData.get("codes")}),
      });
      const saved = await response.json() as {error: string; success: string; remaining?: number};
      if (!response.ok) return {error: saved.error || "Could not confirm the upload. Your codes are kept; retry the same codes.", success: ""};
      if (typeof saved.success !== "string" || !saved.success) throw new Error("Missing upload confirmation");
      if (saved.success) {
        if (typeof saved.remaining === "number" && Number.isInteger(saved.remaining) && saved.remaining >= 0) setSavedRemaining(saved.remaining);
        setCodes("");
        router.refresh();
      }
      return saved;
    } catch {
      return { error: "Could not confirm the upload result. Your entered codes are kept. You can retry the same codes safely; already saved codes will be skipped.", success: "" };
    } finally {
      setShowConfirmation(false);
    }
  }, { error: "", success: "" });
  const deliveredCount = Math.max(0, Number(item.delivered_count ?? 0));
  const remainingQuantity = Math.min(Math.max(0, item.quantity - deliveredCount), savedRemaining ?? Infinity);
  const { enteredCodes, duplicateCount } = useMemo(() => {
    const enteredCodes = codes.split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
    return { enteredCodes, duplicateCount: enteredCodes.length - new Set(enteredCodes).size };
  }, [codes]);
  const enteredCodeCount = enteredCodes.length;
  const invalidCodeCount =
    enteredCodeCount < 1 ||
    enteredCodeCount > remainingQuantity ||
    duplicateCount > 0;
  const reviewPageSize = 100;
  const reviewPageCount = Math.max(1, Math.ceil(enteredCodeCount / reviewPageSize));
  function openReview() {
    setReviewPage(0);
    setShowConfirmation(true);
  }
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
    {result.error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.error}</p>}
    {result.success && <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result.success}</p>}
    <p className="line-clamp-2 font-black text-slate-800">{item.product_name}{item.option_name ? ` · ${item.option_name}` : ""}</p>
    <label className="mt-3 block text-sm font-bold text-slate-700">Delivery method
      <select value={method} disabled={isSending || isCompleting} onChange={event => { setMethod(event.target.value); setShowConfirmation(false); }} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2">
        <option value="codes" disabled={item.service_only}>Send codes</option>
        <option value="service">Confirm UID / In-account purchase</option>
      </select>
    </label>
    {method === "codes" ? <>
    <p className="mt-1 text-xs text-slate-500">
      {remainingQuantity > 0
        ? `${remainingQuantity} code(s) remaining. Send any batch from 1 to ${remainingQuantity}, one code per line.`
        : "All codes have been delivered or refunded for this item."}
    </p>
    <form
      id={`send-${item.id}`}
      action={sendCodes}
      onSubmit={(event) => {
        if (isSending || invalidCodeCount) {
          event.preventDefault();
          return;
        }
        if (!showConfirmation) {
          event.preventDefault();
          openReview();
        }
      }}
      className="mt-3 grid gap-2"
    >
      <input type="hidden" name="order_id" value={orderId} /><input type="hidden" name="item_id" value={item.id} />
      <label className="text-xs font-bold text-slate-600">CSV file<input type="file" disabled={isSending} accept=".csv,.txt" onChange={(event) => loadCsv(event.target.files?.[0])} className="mt-1 block w-full rounded-lg border border-blue-200 bg-blue-50 text-xs text-slate-600 file:mr-3 file:cursor-pointer file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white hover:file:bg-blue-500" /></label>
      <textarea readOnly={isSending} name="codes" value={codes} onChange={(event) => { setCodes(event.target.value); setShowConfirmation(false); }} rows={4} required placeholder="One code per line" className="w-full resize-y rounded-lg border border-blue-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500" />
    </form>
    <p className={`mt-2 text-xs font-bold ${enteredCodeCount > remainingQuantity ? "text-red-600" : "text-slate-500"}`}>
      Entered: {enteredCodeCount} / Remaining: {remainingQuantity}
    </p>
    {duplicateCount > 0 && <p role="alert" className="mt-1 text-xs font-bold text-red-700">Remove {duplicateCount} duplicate code(s) before sending.</p>}
    {enteredCodeCount > remainingQuantity && <p role="alert" className="mt-1 text-xs font-bold text-red-700">This batch exceeds the {remainingQuantity} remaining code(s).</p>}
    {!invalidCodeCount && <p className="mt-1 text-xs text-slate-600">Send {enteredCodeCount} now · {remainingQuantity - enteredCodeCount} remaining after this batch.</p>}
    <button type="button" onClick={openReview} disabled={invalidCodeCount || isSending} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600">Review codes before sending</button>
    </> : (
    <form
      action={confirmService}
      onSubmit={(event) => {
        if (isCompleting || !window.confirm("Confirm that the UID/account purchase has been completed for this customer?")) event.preventDefault();
      }}
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="service_item_id" value={item.id} />
      <ServiceReceiptFields />
    </form>
    )}
    {showConfirmation && (
      <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby={`confirm-codes-${item.id}`}>
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 id={`confirm-codes-${item.id}`} className="text-xl font-black text-slate-900">Review delivery batch</h2>
            <p className="mt-1 text-sm text-slate-600">Send {enteredCodeCount} code(s) now. {remainingQuantity - enteredCodeCount} will remain for later. Nothing is sent until you confirm.</p>
            <p className="mt-2 font-bold text-blue-700">{item.product_name}{item.option_name ? ` · ${item.option_name}` : ""} · {enteredCodeCount} code{enteredCodeCount === 1 ? "" : "s"}</p>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {enteredCodes.slice(reviewPage * reviewPageSize, (reviewPage + 1) * reviewPageSize).map((code, index) => (
              <li key={`${code}-${index}`} className="grid grid-cols-[3rem_1fr] gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-right font-bold text-slate-400">{reviewPage * reviewPageSize + index + 1}.</span>
                <span className="break-all font-mono text-slate-900">{code}</span>
              </li>
            ))}
          </ol>
          {reviewPageCount > 1 && <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-2 text-sm text-slate-700">
            <button type="button" disabled={reviewPage === 0 || isSending} onClick={() => setReviewPage(page => page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous codes</button>
            <span>Page {reviewPage + 1} of {reviewPageCount}</span>
            <button type="button" disabled={reviewPage + 1 === reviewPageCount || isSending} onClick={() => setReviewPage(page => page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next codes</button>
          </div>}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <button type="button" disabled={isSending} onClick={() => setShowConfirmation(false)} className="rounded-xl border border-slate-300 px-4 py-3 font-black text-slate-700">Back and edit</button>
            <button form={`send-${item.id}`} type="submit" disabled={isSending || invalidCodeCount} className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-500">{isSending ? "Saving codes... Please wait" : "Confirm and send"}</button>
          </div>
        </div>
      </div>
    )}
  </article>;
}

function ServiceReceiptFields() {
  const { pending } = useFormStatus();
  const [error, setError] = useState("");
  return <fieldset disabled={pending} className="mt-3 grid gap-3">
    <label className="text-sm font-bold text-slate-700">Delivery receipt (optional)
      <input type="file" name="delivery_receipt" accept="image/jpeg,image/png,application/pdf" onChange={event => {
        const file = event.target.files?.[0];
        const message = file && (file.size === 0 || file.size > DELIVERY_RECEIPT_MAX_BYTES) ? "Choose a JPG, PNG or PDF receipt up to 3 MB." : "";
        event.target.setCustomValidity(message);
        setError(message);
      }} className="mt-2 block w-full rounded-lg border border-blue-200 p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white" />
    </label>
    <p className="text-xs text-slate-500">JPG, PNG or PDF, up to 3 MB. The customer can view this receipt after the full order is completed.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={pending || Boolean(error)} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-50">
      {pending ? "Saving delivery…" : "Confirm UID / account purchase delivered"}
    </button>
  </fieldset>;
}
