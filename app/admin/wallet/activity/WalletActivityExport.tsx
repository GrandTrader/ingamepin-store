"use client";

import { useRef, useState, type MouseEvent } from "react";

type Props = { customerId: string };
export default function WalletActivityExport({ customerId }: Props) {
  const busy = useRef(false);
  const [pending, setPending] = useState<"filtered" | "all" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function download(event: MouseEvent<HTMLButtonElement>, allHistory: boolean) {
    if (busy.current) return;
    const form = event.currentTarget.form;
    const params = new URLSearchParams();
    if (customerId) params.set("customer", customerId);
    if (!allHistory && form) {
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      for (const key of ["from", "to", "type", "reference"]) {
        const value = String(data.get(key) ?? "").trim();
        if (value) params.set(key, value);
      }
    }
    busy.current = true;
    setPending(allHistory ? "all" : "filtered"); setError(""); setMessage("");
    try {
      const response = await fetch("/admin/wallet/activity/export?" + params.toString(), { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === "string" ? result.error : "Unable to export wallet activity. Please try again.");
      }
      if (!response.headers.get("Content-Type")?.includes("text/csv")) throw new Error("Please sign in as an administrator again, then retry the export.");
      // Save only after the entire response succeeds, so failed batches never create a partial file.
      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.match(/filename="([a-zA-Z0-9_.-]+)"/)?.[1] ?? "wallet-activity.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("CSV downloaded.");
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "The export could not finish. Please try again.");
    } finally {
      busy.current = false; setPending(null);
    }
  }

  const buttonClass = "min-h-10 rounded-lg border px-3 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60";
  return <div className="min-w-0 sm:ml-auto">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending !== null} onClick={event => download(event, false)} className={buttonClass + " border-blue-600 bg-blue-600 text-white hover:bg-blue-700"}>{pending === "filtered" ? "Exporting…" : "Export CSV"}</button>
      <button type="button" disabled={pending !== null} onClick={event => download(event, true)} className={buttonClass + " border-slate-200 bg-white text-blue-600 hover:bg-blue-50"}>{pending === "all" ? "Exporting…" : "Export all history"}</button>
    </div>
    <p aria-live="polite" className="mt-2 text-xs text-slate-500">{pending ? "Preparing all matching transactions…" : message || "Export CSV uses the dates and filters above."}</p>
    {error && <p role="alert" className="mt-2 max-w-md text-sm text-red-700">{error}</p>}
  </div>;
}
