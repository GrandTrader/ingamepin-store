"use client";

import { useState } from "react";

import type {
  WalletGateway,
  WalletGatewayId,
} from "@/lib/wallet-payment-gateways";

export default function WalletTopupForm({
  gateways,
  currentBalance,
}: {
  gateways: WalletGateway[];
  currentBalance: number;
}) {
  const [amount, setAmount] = useState("25");
  const [gateway, setGateway] = useState<WalletGatewayId>(
    gateways[0]?.id ?? "BINANCE_PAY",
  );
  const [network, setNetwork] = useState<"TRC20" | "BEP20" | "SOLANA">("TRC20");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [gatewayOpened, setGatewayOpened] = useState(false);
  const amountNumber = Math.max(0, Number(amount) || 0);

  async function continueToPayment() {
    const keepWalletOpen = gateway === "FREEKASSA" || gateway === "PALLY";
    const paymentWindow = keepWalletOpen
      ? window.open("about:blank", "_blank")
      : null;

    if (paymentWindow) {
      paymentWindow.document.title = "Opening secure payment...";
      paymentWindow.opener = null;
    }

    setIsSubmitting(true);
    setMessage("");
    setGatewayOpened(false);

    try {
      const response = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNumber,
          gateway,
          network: gateway === "USDT_DIRECT" ? network : undefined,
        }),
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error ?? "Unable to start wallet top-up.");
      }

      if (paymentWindow && !paymentWindow.closed) {
        paymentWindow.location.replace(result.checkoutUrl);
        setGatewayOpened(true);
        setIsSubmitting(false);
        return;
      }
      window.location.href = result.checkoutUrl;
    } catch (error) {
      paymentWindow?.close();
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start wallet top-up.",
      );
      setIsSubmitting(false);
    }
  }

  if (!gateways.length) {
    return (
      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
        No wallet payment gateway is currently available.
      </div>
    );
  }

  return (
    <div className="mt-7 space-y-6">
      <label className="block text-sm font-bold text-slate-700">
        <span className="flex items-center justify-between gap-3">
          <span>Top-up amount (USD)</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
            Minimum amount: $10
          </span>
        </span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min="10"
          max="10000"
          step="0.01"
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-black outline-none focus:border-cyan-500"
        />
      </label>

      <div>
        <p className="text-sm font-bold text-slate-700">Payment method</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {gateways.map((item) => {
            const selected = gateway === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setGateway(item.id)}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100"
                    : "border-slate-200 bg-white hover:border-cyan-300"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 font-black text-cyan-300">
                  {item.icon}
                </span>
                <span>
                  <span className="block font-black">{item.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {gateway === "USDT_DIRECT" && (
        <div>
          <p className="text-sm font-bold text-slate-700">USDT network</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["TRC20", "BEP20", "SOLANA"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setNetwork(item)}
                className={`rounded-xl border px-4 py-3 font-black ${
                  network === item
                    ? "border-cyan-500 bg-cyan-50 text-cyan-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                USDT {item}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-950 p-5 text-white">
        <div className="flex justify-between gap-4 text-sm">
          <span className="text-slate-400">Add amount</span>
          <strong>${amountNumber.toFixed(2)}</strong>
        </div>
        <div className="mt-3 flex justify-between gap-4 border-t border-white/10 pt-3">
          <span className="text-slate-400">New balance</span>
          <strong className="text-xl text-cyan-300">
            ${(currentBalance + amountNumber).toFixed(2)}
          </strong>
        </div>
      </div>

      {message && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {message}
        </p>
      )}

      {gatewayOpened && (
        <p className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold text-cyan-800">
          The payment page opened separately. Close it at any time to return
          to your InGamePIN wallet.
        </p>
      )}

      <button
        type="button"
        onClick={() => void continueToPayment()}
        disabled={
          isSubmitting ||
          !Number.isFinite(amountNumber) ||
          amountNumber < 10 ||
          amountNumber > 10000
        }
        className="w-full rounded-xl bg-cyan-400 px-5 py-4 font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
      >
        {isSubmitting ? "Opening payment gateway..." : "Continue to payment"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Minimum wallet top-up: $10. New configured gateway adapters appear
        here automatically.
      </p>
    </div>
  );
}
