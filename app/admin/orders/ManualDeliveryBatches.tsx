"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManualDeliveryBatch } from "@/lib/manual-delivery-batches";

type Batch = ManualDeliveryBatch & { title: string; number: number };
const formatDate = (date: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
function BatchCard({ orderId, batch, locked }: { orderId: string; batch: Batch; locked: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false), [reason, setReason] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [codes, setCodes] = useState<{ id: string; code: string }[] | null>(null), [codePage, setCodePage] = useState(1), [loadingCodes, setLoadingCodes] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const inactive = Boolean(batch.revoked_at) || revoked;
  async function viewCodes(page: number) {
    setLoadingCodes(true); setError("");
    try {
      const response = await fetch("/api/admin/orders/delivery/batches?" + new URLSearchParams({ orderId, batchId: batch.id, page: String(page) }), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.codes)) throw new Error(result.error || "Unable to load batch codes.");
      setCodes(result.codes); setCodePage(page); if (result.revoked) setRevoked(true);
    } catch { setError("Unable to load batch codes. Please retry."); } finally { setLoadingCodes(false); }
  }
  async function revoke(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/orders/delivery/batches", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, batchId: batch.id, reason, confirmed: true }) });
      const result = await response.json();
      if (!response.ok || typeof result.success !== "string") throw new Error(result.error || "Unable to confirm revocation. Refresh the order before retrying.");
      setSuccess(result.success); setRevoked(true); setConfirming(false); setCodes(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm revocation. Refresh the order before retrying."); }
    finally { setPending(false); }
  }
  const button = "min-h-10 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50";
  return <article className={"min-w-0 rounded-xl border p-3 " + (inactive ? "border-red-200 bg-red-50" : "border-slate-200 bg-white")}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h3 className="break-words font-bold">{batch.title}</h3><p className="mt-1 text-sm font-bold">Batch {batch.number} · {batch.code_count} codes <span className={inactive ? "text-red-700" : "text-emerald-700"}>· {inactive ? "Revoked" : "Sent"}</span></p><p className="mt-1 text-xs text-slate-500">{formatDate(batch.sent_at)} IST</p>{batch.legacy && <p className="mt-1 text-xs text-slate-500">Earlier delivery, grouped by saved delivery time.</p>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={loadingCodes} onClick={() => codes ? setCodes(null) : viewCodes(1)} className={button + " border-slate-300 text-blue-700"}>{loadingCodes ? "Opening…" : codes ? "Hide codes" : "View codes"}</button>{!inactive && <button type="button" disabled={locked || pending} onClick={() => { setConfirming(true); setError(""); }} className={button + " border-red-300 text-red-700"}>Revoke batch</button>}</div>
    </div>
    {batch.revoked_at && <p className="mt-2 break-words text-xs text-red-800">Revoked {formatDate(batch.revoked_at)} IST · {batch.revoke_reason}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}{success && <p role="status" className="mt-2 text-sm text-emerald-800">{success}</p>}
    {confirming && !inactive && <form onSubmit={revoke} className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-bold text-red-900">Revoke all {batch.code_count} codes in Batch {batch.number}?</p>
      <p className="mt-1 text-xs text-red-800">This reopens {batch.code_count} codes for replacement. Existing emails and downloaded copies cannot be recalled. The gift cards themselves are not cancelled.</p>
      <label className="mt-3 block text-xs font-bold">Reason<input value={reason} onChange={event => setReason(event.target.value)} required minLength={3} maxLength={500} disabled={pending} className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" placeholder="For example: incorrect codes sent" /></label>
      <div className="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={pending || reason.trim().length < 3} className={button + " border-red-600 bg-red-600 text-white"}>{pending ? "Revoking…" : "Confirm revocation"}</button><button type="button" disabled={pending} onClick={() => setConfirming(false)} className={button + " border-slate-300 bg-white"}>Cancel</button></div>
    </form>}
    {codes && <div className="mt-3"><p className="mb-2 text-xs font-bold">{inactive ? "Revoked codes — admin history only" : "Batch codes"}</p><ol start={(codePage - 1) * 100 + 1} className="max-h-72 list-inside list-decimal space-y-1 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-cyan-200">{codes.map(entry => <li className="break-all" key={entry.id}>{entry.code}</li>)}</ol><div className="mt-2 flex items-center justify-between gap-2 text-xs"><span>Page {codePage} of {Math.max(1, Math.ceil(batch.code_count / 100))}</span><div className="flex gap-2">{codePage > 1 && <button disabled={loadingCodes} onClick={() => viewCodes(codePage - 1)} className={button}>Previous</button>}{codePage * 100 < batch.code_count && <button disabled={loadingCodes} onClick={() => viewCodes(codePage + 1)} className={button}>Next</button>}</div></div></div>}
  </article>;
}
export default function ManualDeliveryBatches({ orderId, batches, locked }: { orderId: string; batches: Batch[]; locked: boolean }) {
  if (!batches.length) return null;
  return <details aria-label="Delivery batches" className="group/batches mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <h2 className="text-xl font-black">Delivery batches</h2>
        <p className="mt-1 text-sm text-slate-600">{batches.length} batch{batches.length === 1 ? "" : "es"}. Open to view codes or revoke a batch.</p>
      </div>
      <span className="shrink-0 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-blue-700">
        <span className="group-open/batches:hidden">Show batches</span>
        <span className="hidden group-open/batches:inline">Hide batches</span>
      </span>
    </summary>
    {locked && <p className="mt-2 text-sm text-amber-800">Batch revocation is unavailable while this order is unpaid, cancelled, refunded, or held for a refund request.</p>}
    <div className="mt-4 space-y-3">{[...batches].reverse().map(batch => <BatchCard key={batch.id} orderId={orderId} batch={batch} locked={locked} />)}</div>
  </details>;
}
