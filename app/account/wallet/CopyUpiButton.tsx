"use client";

import { useState } from "react";

const UPI_ID = "AGAMAN315@iob";

export default function CopyUpiButton() {
  const [copied, setCopied] = useState(false);

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyUpiId}
      className="mt-3 w-full rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 transition hover:bg-cyan-100"
    >
      {copied ? "UPI ID copied!" : "Copy UPI ID"}
    </button>
  );
}
