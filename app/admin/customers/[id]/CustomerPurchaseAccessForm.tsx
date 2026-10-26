"use client";

import { startTransition, useActionState, useState } from "react";
import { saveCustomerPurchaseAccess, type PurchaseAccessResult } from "../purchase-access-actions";

export type PurchaseAccessState = {
  enabled: boolean; blockDevices: boolean; blockIps: boolean; reason: string;
  devices: number; ips: number; protected: boolean; updatedAt: string | null;
};
export default function CustomerPurchaseAccessForm({ customerId, initial }: { customerId: string; initial: PurchaseAccessState }) {
  const [result, action, pending] = useActionState(saveCustomerPurchaseAccess, {} as PurchaseAccessResult);
  const [ips, setIps] = useState(initial.blockIps);
  const [devices, setDevices] = useState(initial.blockDevices);
  const [reason, setReason] = useState(initial.reason);
  return <section className={`mt-6 rounded-2xl border p-5 shadow-sm ${initial.enabled ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Financial restrictions</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${initial.enabled ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>{initial.enabled ? "Financial transactions blocked" : "No financial restriction"}</span></div>
    <p className="mt-2 text-sm text-slate-600">Block purchases, payment retries, wallet top-ups, spending, withdrawals and refund claims. Previous orders, wallet history, sign-in and support remain accessible. Late payments are held for review.</p>
    {initial.protected ? <p className="mt-3 text-sm">Administrator accounts cannot be restricted here.</p> : <details className="mt-4" open={initial.enabled || undefined}>
      <summary className="cursor-pointer py-2 font-bold text-blue-700">Manage financial access</summary>
      <form method="post" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        data.set("action", submitter?.value || "restrict");
        startTransition(() => action(data));
      }} className="mt-3 space-y-4">
        <input type="hidden" name="customer_id" value={customerId} />
        <fieldset disabled={pending} className="space-y-3">
          <p className="text-sm font-semibold">Account and email are always included.</p>
          <p className="text-xs text-slate-600">Removing this restriction does not re-enable a separately disabled wallet or automatically release held payments.</p>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="devices" checked={devices} onChange={e => setDevices(e.target.checked)} className="h-5 w-5 shrink-0" />Also block recorded browsers/devices ({initial.devices})</label>
          <p className="text-xs text-slate-600">Uses signed browser IDs recorded in the last 180 days and previously linked IDs. New browsers used by this account at sign-in or checkout are included. Clearing cookies or using another browser can bypass this link; it is not an IMEI or hardware ID.</p>
          {!initial.devices && <p className="text-sm text-amber-800">No browser ID is recorded yet. Account and email restrictions still apply.</p>}
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="ips" checked={ips} onChange={e => setIps(e.target.checked)} className="h-5 w-5 shrink-0" />Also block recorded IP addresses ({initial.ips})</label>
          {ips && <p className="text-sm text-amber-800">IP blocking can affect other customers using the same network or VPN.</p>}
          <label className="block text-sm font-semibold">Internal reason<textarea name="reason" required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason for restricting or restoring financial access" className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950" /></label>
          <p className="text-xs text-slate-600">Only administrators can see this reason. Changes are logged.</p>
          <div className="flex flex-wrap gap-3">
            <button name="action" value="restrict" className="min-h-11 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving…" : initial.enabled ? "Save restrictions" : "Restrict financial transactions"}</button>
            {initial.enabled && <button name="action" value="allow" className="min-h-11 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Remove financial restriction</button>}
          </div>
        </fieldset>
        {result.error && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
        {result.success && <p role="status" className="text-sm text-emerald-800">{result.success}</p>}
      </form>
    </details>}
  </section>;
}
