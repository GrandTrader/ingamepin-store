"use client";

export default function PrintSavedInvoiceButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white"
    >
      Print / Save PDF
    </button>
  );
}
