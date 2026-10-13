"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { configureFKDelivery } from "@/app/admin/fkwallet/delivery-actions";

export default function FKWalletDeliveryControl({ productId, enabled, ready, deliveryKind }: {
  productId: string; enabled: boolean; ready: boolean; deliveryKind: string;
}) {
  const [kind, setKind] = useState(deliveryKind), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter();
  return <div className="mt-4 space-y-3">
    {!enabled && <label className="block max-w-md text-sm font-bold">Delivery method
      <select value={kind} onChange={event => setKind(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-xl border bg-white p-3">
        <option value="CODE">Digital code to the order page</option>
        <option value="ACCOUNT">Activation on the customer’s account</option>
      </select>
    </label>}
    <button disabled={busy || (!enabled && !ready)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
      setBusy(true); setMessage("");
      try { const result = await configureFKDelivery(productId, !enabled, kind); if (result.error) setMessage(result.error); else { setMessage(enabled ? "Automatic delivery disabled." : "Automatic delivery enabled. Product publication is unchanged."); router.refresh(); } }
      catch { setMessage("The settings could not be saved. Refresh and check the delivery status."); }
      finally { setBusy(false); }
    }}>{busy ? "Saving…" : enabled ? "Disable FKWallet automatic delivery" : "Enable FKWallet automatic delivery"}</button>
    {!enabled && !ready && <p className="text-sm text-amber-900">Setup pending: install the delivery database update and start the delivery worker.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
