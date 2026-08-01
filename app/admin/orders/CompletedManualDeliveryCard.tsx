"use client";

import { useState } from "react";

type DeliveredCode = {
  code: string;
  sold_at: string | null;
};

export default function CompletedManualDeliveryCard({
  productName,
  optionName,
  codes,
}: {
  productName: string;
  optionName: string | null;
  codes: DeliveredCode[];
}) {
  const [open, setOpen] = useState(false);

  async function copyCodes() {
    await navigator.clipboard.writeText(codes.map((entry) => entry.code).join("\n"));
  }

  function downloadCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["Voucher code", "Delivered at"],
      ...codes.map((entry) => [
        entry.code,
        entry.sold_at ? new Date(entry.sold_at).toISOString() : "",
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(optionName || productName).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-delivered-codes.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="font-black text-slate-800">
        {productName}{optionName ? ` · ${optionName}` : ""}
      </p>
      <p className="mt-2 inline-flex rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
        COMPLETED
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800">
          {open ? "Hide content" : "View content"}
        </button>
        <button type="button" onClick={copyCodes} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800">
          Copy codes
        </button>
        <button type="button" onClick={downloadCsv} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">
          Download CSV
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {codes.map((entry, index) => (
            <div key={`${entry.code}-${index}`} className="rounded-lg border border-emerald-200 bg-white p-3">
              <p className="break-all font-mono text-sm font-bold text-slate-800">{entry.code}</p>
              <p className="mt-1 text-xs text-slate-500">
                {entry.sold_at ? new Date(entry.sold_at).toLocaleString() : "Delivery date unavailable"}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
