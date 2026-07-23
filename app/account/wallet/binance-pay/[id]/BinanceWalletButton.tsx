"use client";

import { useState } from "react";

export default function BinanceWalletButton({ requestId }: { requestId: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function openBinancePay() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/binance-pay/wallet/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error ?? "Unable to open Binance Pay.");
      }

      window.location.href = result.checkoutUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open Binance Pay.");
      setLoading(false);
    }
  }

  return (
    <div>
      {message && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={() => void openBinancePay()}
        disabled={loading}
        className="w-full rounded-xl bg-amber-300 px-5 py-4 font-black text-slate-950 disabled:opacity-60"
      >
        {loading ? "Opening Binance Pay..." : "Pay with Binance Pay"}
      </button>
    </div>
  );
}
