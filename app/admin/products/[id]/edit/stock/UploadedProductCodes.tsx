"use client";
import { useEffect, useState } from "react";
import AdminSubmitButton from "@/components/AdminSubmitButton";
import { changeCodeStatusForOption, deleteProductCode } from "../ProductCodeInventoryActions";
type Code = { id: string; code: string; status: "AVAILABLE" | "RESERVED" | "SOLD" | "DISABLED"; created_at: string };
export default function UploadedProductCodes({ productId, optionId, revision }: { productId: string; optionId: string; revision: string }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ codes: Code[]; total: number }>({ codes: [], total: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true); setError("");
    void (async () => {
      try {
        const response = await fetch("/api/admin/products/" + productId + "/codes?optionId=" + encodeURIComponent(optionId) + "&page=" + page, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to read codes.");
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(data.total / 10));
        if (page > lastPage) { setPage(lastPage); return; }
        setResult(data);
      } catch (failure) {
        if (active) setError(controller.signal.aborted ? "The request timed out. Try again." : failure instanceof Error ? failure.message : "Unable to read codes.");
      } finally { clearTimeout(timeout); if (active) setBusy(false); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [productId, optionId, page, revision, retry]);
  const pages = Math.max(1, Math.ceil(result.total / 10));
  return <section className="mt-3" aria-label="Uploaded voucher codes" aria-busy={busy}>
    {busy && <p role="status" className="py-3 text-sm text-slate-500">Fetching 10 codes…</p>}
    {error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 px-3 font-bold underline">Retry</button></div> : <>
      <fieldset disabled={busy} className="grid gap-2">
        {result.codes.map(code => <article key={code.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><strong>{code.status}</strong><time>{new Date(code.created_at).toLocaleString()}</time></div>
          <p className="my-3 whitespace-pre-wrap break-all font-mono text-sm">{code.code}</p>
          {(code.status === "AVAILABLE" || code.status === "DISABLED") && <div className="flex flex-wrap gap-2">
            <form action={changeCodeStatusForOption.bind(null, productId, code.id, code.status === "AVAILABLE" ? "DISABLED" : "AVAILABLE")}><AdminSubmitButton className="min-h-11 rounded-lg border px-3 text-sm font-bold">{code.status === "AVAILABLE" ? "Disable" : "Enable"}</AdminSubmitButton></form>
            <form action={deleteProductCode.bind(null, productId, code.id)} onSubmit={event => { if (!window.confirm("Permanently delete this voucher code?")) event.preventDefault(); }}><AdminSubmitButton pendingLabel="Deleting…" className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-600">Delete</AdminSubmitButton></form>
          </div>}
        </article>)}
      </fieldset>
      {!busy && result.total === 0 && <p className="py-3 text-sm text-slate-500">No codes for this denomination.</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{result.total} codes · Page {page} of {pages}</span><div className="flex gap-2"><button type="button" disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Previous</button><button type="button" disabled={busy || page >= pages} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Next</button></div></div>
    </>}
  </section>;
}
