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
  const [copied, setCopied] = useState(false);
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
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setQrCode);
  }, [selectedNetwork.address]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(selectedNetwork.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage("Unable to copy the address. Please copy it manually.");
    }
  }

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
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white sm:py-7">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-6">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">Manual Crypto</p>
          <h1 className="mt-1 text-2xl font-black">Crypto payment</h1>
          <p className="mt-1 text-sm text-slate-400">Send the full amount in USDT using one selected network.</p>
        </div>

        <div className="mt-4 grid items-start gap-4 sm:grid-cols-[320px_minmax(0,1fr)]">
          {qrCode && (
            <div className="mx-auto w-fit rounded-2xl bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt={`USDT ${selectedNetwork.label} wallet QR code`} width={300} height={300} />
            </div>
          )}

          <div>
            <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Select a network</p>
            <select value={network} onChange={(event) => { setNetwork(event.target.value as ManualUsdtNetwork); setTransactionHash(""); setCopied(false); }} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 font-black">
              {MANUAL_USDT_NETWORKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className="mt-3 rounded-2xl bg-slate-950 p-3 text-center">
            <p className="text-sm text-slate-500">Amount to send</p>
            <p className="text-3xl font-black text-cyan-400">{order.totalAmount.toFixed(2)} <span className="text-lg text-slate-300">USDT</span></p>
            <p className="text-xs text-slate-500">Order total: {formatPrice(order.totalAmount)}</p>
          </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{selectedNetwork.label} wallet address</p>
          <p className="mt-1 break-all font-mono text-xs">{selectedNetwork.address}</p>
          <button
            type="button"
            onClick={() => void copyAddress()}
            className={`mt-2 rounded-lg px-3 py-2 text-xs font-black text-white shadow-sm transition ${copied ? "bg-emerald-600" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            {copied ? "✓ Copied" : "Copy address"}
          </button>
          <span aria-live="polite" className={`ml-3 text-xs font-black text-emerald-700 transition ${copied ? "opacity-100" : "opacity-0"}`}>
            Address copied!
          </span>
        </div>

        <p className="mt-3 rounded-xl border border-amber-400 bg-amber-100 p-2.5 text-xs font-bold text-amber-950">
          Only send USDT on {selectedNetwork.label}. Sending another token or network may permanently lose your funds.
        </p>
          </div>
        </div>

        {submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
            <p className="font-black text-emerald-200">Payment submitted for verification.</p>
            <p className="mt-2 text-sm text-slate-300">Your order will be processed after an administrator confirms the transaction.</p>
            <Link href="/purchases" className="mt-4 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950">View purchases</Link>
          </div>
        ) : (
          <form onSubmit={submitPayment} className="mt-4">
            <label className="block text-sm font-bold" htmlFor="transactionHash">Transaction hash</label>
            <input
              id="transactionHash"
              value={transactionHash}
              onChange={(event) => setTransactionHash(event.target.value.trim())}
              placeholder="0x..."
              required
              minLength={40}
              maxLength={120}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 font-mono text-sm outline-none focus:border-cyan-400"
            />
            {message && <p className="mt-3 rounded-xl bg-red-400/10 p-3 text-sm text-red-200">{message}</p>}
            <button disabled={submitting} className="mt-3 w-full rounded-xl bg-cyan-400 px-5 py-2.5 font-black text-slate-950 disabled:opacity-60">
              {submitting ? "Submitting..." : "I confirm that I have made the payment"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
