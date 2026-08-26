"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { FormEvent, useEffect, useState } from "react";

import { useStorePreferences } from "@/components/StorePreferences";
import { MANUAL_USDT_NETWORKS, type ManualUsdtNetwork } from "@/lib/manual-usdt";

type PendingOrder = {
  id: string;
  databaseId?: string;
  accessToken?: string;
  paymentMethod?: string;
  totalAmount: number;
};

export default function ManualUsdtPage() {
  const { formatPrice } = useStorePreferences();
  const [order, setOrder] = useState<PendingOrder | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [network, setNetwork] = useState<ManualUsdtNetwork>("BEP20");
  const selectedNetwork = MANUAL_USDT_NETWORKS.find((item) => item.id === network) ?? MANUAL_USDT_NETWORKS[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pendingOrder");
      const parsed = saved ? (JSON.parse(saved) as PendingOrder) : null;
      if (
        !parsed?.databaseId ||
        !parsed.accessToken ||
        parsed.paymentMethod?.toLowerCase() !== "upi"
      ) {
        setOrder(null);
        return;
      }
      setOrder(parsed);
    } catch {
      setOrder(null);
    }
  }, []);

  useEffect(() => {
    void QRCode.toDataURL(selectedNetwork.address, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setQrCode);
  }, [selectedNetwork.address]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order?.databaseId || !order.accessToken) return;

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/manual-usdt/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.databaseId,
          accessToken: order.accessToken,
          transactionHash,
          network,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to submit payment.");

      localStorage.setItem(
        "latestOrder",
        JSON.stringify({ ...order, status: "PAYMENT_REVIEW" }),
      );
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit payment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-20 text-white">
        <div className="mx-auto max-w-xl rounded-3xl bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-black">Payment unavailable</h1>
          <Link href="/checkout" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950">
            Return to Checkout
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 sm:p-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">Manual Crypto</p>
          <h1 className="mt-3 text-3xl font-black">Crypto payment</h1>
          <p className="mt-3 text-slate-400">Please send the full amount in USDT using one selected network.</p>
          <div className="mt-5 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Select a network</p>
            <select value={network} onChange={(event) => { setNetwork(event.target.value as ManualUsdtNetwork); setTransactionHash(""); }} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 font-black">
              {MANUAL_USDT_NETWORKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-950 p-4">
            <p className="text-sm text-slate-500">Amount to send</p>
            <p className="mt-1 text-4xl font-black text-cyan-400">{order.totalAmount.toFixed(2)} <span className="text-xl text-slate-300">USDT</span></p>
            <p className="mt-1 text-xs text-slate-500">Order total: {formatPrice(order.totalAmount)}</p>
          </div>
        </div>

        {qrCode && (
          <div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt={`USDT ${selectedNetwork.label} wallet QR code`} width={260} height={260} />
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{selectedNetwork.label} wallet address</p>
          <p className="mt-2 break-all font-mono text-sm">{selectedNetwork.address}</p>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(selectedNetwork.address)}
            className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm font-bold"
          >
            Copy address
          </button>
        </div>

        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          Only send USDT on {selectedNetwork.label}. Sending another token or network may permanently lose your funds.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
            <p className="font-black text-emerald-200">Payment submitted for verification.</p>
            <p className="mt-2 text-sm text-slate-300">Your order will be processed after an administrator confirms the transaction.</p>
            <Link href="/purchases" className="mt-4 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950">View purchases</Link>
          </div>
        ) : (
          <form onSubmit={submitPayment} className="mt-6">
            <label className="block text-sm font-bold" htmlFor="transactionHash">Transaction hash</label>
            <input
              id="transactionHash"
              value={transactionHash}
              onChange={(event) => setTransactionHash(event.target.value.trim())}
              placeholder="0x..."
              required
              minLength={40}
              maxLength={120}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-sm outline-none focus:border-cyan-400"
            />
            {message && <p className="mt-3 rounded-xl bg-red-400/10 p-3 text-sm text-red-200">{message}</p>}
            <button disabled={submitting} className="mt-4 w-full rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 disabled:opacity-60">
              {submitting ? "Submitting..." : "I confirm that I have made the payment"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
