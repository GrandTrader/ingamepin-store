"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBusinessBankTransferAccess } from "./actions";

export default function BankTransferSwitch({ userId, enabled, revision }: { userId: string; enabled: boolean; revision: number }) {
  const router = useRouter();
  const [value, setValue] = useState(enabled);
  const [currentRevision, setRevision] = useState(revision);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function toggle() {
    const next = !value;
    const form = new FormData();
    form.set("user_id", userId); form.set("enabled", String(next)); form.set("revision", String(currentRevision));
    setError("");
    start(async () => {
      try {
        const result = await setBusinessBankTransferAccess(form);
        if (result.error) { setError(result.error); return; }
        if (result.revision == null) { setError("Unable to confirm the change. Refresh and try again."); return; }
        setValue(next); setRevision(result.revision); router.refresh();
      } catch { setError("Unable to save. Refresh the customer details and try again."); }
    });
  }
  return <div className="space-y-2">
    <div className="flex items-center gap-3">
      <button type="button" role="switch" aria-label="Direct Bank Transfer" aria-checked={value} disabled={pending} onClick={toggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${value ? "bg-emerald-600" : "bg-slate-400"}`}>
        <span aria-hidden="true" className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className="text-sm font-bold" aria-live="polite">{pending ? "Saving…" : value ? "ON" : "OFF"}</span>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
