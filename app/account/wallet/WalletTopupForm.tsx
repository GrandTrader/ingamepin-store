"use client";

import { useEffect, useState } from "react";

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
  const [paymentFee, setPaymentFee] = useState(0);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const amountNumber = Math.max(0, Number(amount) || 0);

  useEffect(() => {
    const controller = new AbortController();

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setPaymentFee(0);
      setPaymentTotal(0);
      return () => controller.abort();
    }

    void fetch(
      `/api/orders?paymentMethod=${encodeURIComponent(gateway)}&baseTotal=${encodeURIComponent(amountNumber)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const result = (await response.json()) as { fee?: number; total?: number };
        if (!response.ok) throw new Error("Unable to calculate fee.");
        setPaymentFee(Math.max(0, Number(result.fee) || 0));
        setPaymentTotal(Math.max(0, Number(result.total) || amountNumber));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPaymentFee(0);
        setPaymentTotal(amountNumber);
      });

    return () => controller.abort();
  }, [amountNumber, gateway]);

  async function continueToPayment() {
    setIsSubmitting(true);
    setMessage("");

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

      window.location.href = result.checkoutUrl;
    } catch (error) {
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
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-bold text-slate-700">
        <span className="flex items-center justify-between gap-3">
          <span>Top-up amount (USD)</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
            $10–$50,000
          </span>
        </span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          min="10"
          max="50000"
          step="0.01"
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-black outline-none focus:border-cyan-500"
        />
      </label>

      <div>
        <label htmlFor="wallet-gateway" className="block text-sm font-bold text-slate-700">Payment method</label>
        <select id="wallet-gateway" value={gateway} onChange={event => setGateway(event.target.value as WalletGatewayId)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
          {gateways.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <details className="mt-1 text-xs text-slate-500">
          <summary aria-label="Payment method information" className="w-fit cursor-pointer py-1 font-semibold">ⓘ Payment information</summary>
          <p className="mt-1">{gateways.find(item => item.id === gateway)?.description}</p>
          <p className="mt-1">Your USD wallet is credited after verified payment. Fees are shown below.</p>
        </details>
      </div>

      {gateway === "USDT_DIRECT" && (
        <div>
          <p className="text-sm font-bold text-slate-700">USDT network</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["TRC20", "BEP20", "SOLANA"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setNetwork(item)}
                aria-pressed={network === item}
                className={`rounded-lg border px-2 py-2.5 text-xs font-bold ${
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

      <div className="rounded-lg bg-slate-950 p-3 text-white">
        <div className="flex justify-between gap-3 text-xs">
          <span className="text-slate-400">Add amount</span>
          <strong>${amountNumber.toFixed(2)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3 border-t border-white/10 pt-2 text-xs text-sm">
          <span className="text-slate-400">Payment gateway fee</span>
          <strong>${paymentFee.toFixed(2)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3 border-t border-white/10 pt-2 text-xs">
          <span className="text-slate-400">Amount to pay</span>
          <strong className="text-base text-amber-300">
            ${(paymentTotal || amountNumber).toFixed(2)}
          </strong>
        </div>
        <div className="mt-2 flex justify-between gap-3 border-t border-white/10 pt-2 text-xs">
          <span className="text-slate-400">New balance</span>
          <strong className="text-base text-cyan-300">
            ${(currentBalance + amountNumber).toFixed(2)}
          </strong>
        </div>
      </div>

      {amount !== "" && (!Number.isFinite(amountNumber) || amountNumber < 10 || amountNumber > 50000) && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          Enter an amount between USD 10 and USD 50,000.
        </p>
      )}

      {message && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={() => void continueToPayment()}
        disabled={
          isSubmitting ||
          !Number.isFinite(amountNumber) ||
          amountNumber < 10 ||
          amountNumber > 50000
        }
        className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
      >
        {isSubmitting ? "Opening payment gateway..." : "Continue to payment"}
      </button>


    </div>
  );
}
