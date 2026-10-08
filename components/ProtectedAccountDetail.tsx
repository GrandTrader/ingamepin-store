"use client";
import { useEffect, useState } from "react";

export default function ProtectedAccountDetail({ orderItemId, fieldId, label }: { orderItemId: string; fieldId: string; label: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value === null) return;
    const timer = window.setTimeout(() => setValue(null), 60000);
    const hide = () => { if (document.hidden) setValue(null); };
    document.addEventListener("visibilitychange", hide);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [value]);
  async function reveal() {
    if (value !== null) { setValue(null); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/protected-details", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderItemId, fieldId }) });
      const body = await response.json();
      if (!response.ok || typeof body.value !== "string") throw Error(body.error || "Unable to reveal details.");
      setValue(body.value);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reveal details."); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 max-w-xl rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all">{label}: <strong>{value ?? "••••••••"}</strong></span>
      <button type="button" disabled={busy} onClick={reveal} className="rounded-md bg-blue-600 px-3 py-1.5 font-bold text-white">{busy ? "Checking…" : value === null ? "Reveal" : "Hide"}</button>
    </div>
    {value !== null && <p className="mt-1">Hidden automatically after one minute. This access is recorded.</p>}
    {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
  </div>;
}
