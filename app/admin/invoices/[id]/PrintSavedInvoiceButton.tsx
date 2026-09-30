"use client";

export default function PrintSavedInvoiceButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white hover:bg-blue-700"
    >
      Print / Save PDF
    </button>
  );
}
