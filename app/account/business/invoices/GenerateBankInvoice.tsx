"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isBusinessPortalPath } from "@/lib/portal-navigation";
import { generateBankInvoice } from "./actions";

export default function GenerateBankInvoice() {
  const router = useRouter(), path = usePathname();
  const request = useRef<{ amount: string; id: string } | null>(null);
  const [error, setError] = useState(""), [pending, start] = useTransition();
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget), amount = String(form.get("amount"));
    if (!request.current || request.current.amount !== amount) request.current = { amount, id: crypto.randomUUID() };
    form.set("request_id", request.current.id); setError("");
    start(async () => {
      try {
        const result = await generateBankInvoice(form);
        if (result.error) { setError(result.error); return; }
        const base = isBusinessPortalPath(path) ? "/account/portal/business" : "/account/business";
        router.push(`${base}/invoices/${result.invoiceId}`);
      } catch { setError("Could not confirm invoice creation. Retry with the same amount to recover your invoice."); }
    });
  }}>
    <label className="block text-sm font-bold">Invoice amount (USD)<input name="amount" type="number" min="10" max="50000" step="0.01" required disabled={pending} placeholder="Enter USD 10–50,000" className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /></label>
    <button disabled={pending} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? "Generating invoice…" : "Generate bank deposit invoice"}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
