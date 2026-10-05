"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isBusinessPortalPath } from "@/lib/portal-navigation";
import { countryCallingCodes } from "@/lib/countryCallingCodes";
import { generateBankInvoice } from "./actions";

export default function GenerateBankInvoice({details={}}:{details?:Record<string,string>}) {
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
    <p className="text-sm text-slate-600">Enter your full billing address and tax number. These details will appear on this invoice.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {[["addressLine1","Building / street address","address_line1",200],["addressLine2","Address line 2 (optional)","address_line2",200],["city","City","city",100],["state","State / province","state",100],["postalCode","PIN / postal code","postal_code",30],["taxpayerId","Tax number / GSTIN / TIN","registration_number",100]].map(([key,label,source,max])=><label key={String(key)} className="block text-sm font-bold">{label}<input name={String(key)} required={key!=="addressLine2"} maxLength={Number(max)} defaultValue={details[String(source)] ?? ""} disabled={pending} className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"/></label>)}
      <label className="block text-sm font-bold">Country<select name="country" required defaultValue={details.country ?? ""} disabled={pending} className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"><option value="" disabled>Select country</option>{countryCallingCodes.map(([name])=><option key={name}>{name}</option>)}</select></label>
    </div>
    <label className="block text-sm font-bold">Invoice amount (USD)<input name="amount" type="number" min="10" max="50000" step="0.01" required disabled={pending} placeholder="Enter USD 10–50,000" className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /></label>
    <button disabled={pending} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? "Generating invoice…" : "Generate bank deposit invoice"}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
