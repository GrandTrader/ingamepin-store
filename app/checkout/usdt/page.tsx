"use client";

import Link from "next/link";
import UsdtQrCode from "@/components/UsdtQrCode";
import { useCallback, useEffect, useMemo, useState } from "react";

type PendingOrder = {
  id: string;
  databaseId?: string;
  accessToken?: string;
  paymentMethod?: string;
  totalAmount: number;
};

type Invoice = {
  invoiceId: string;
  orderId: string;
  network: "TRC20" | "BEP20";
  token: "USDT";
  address: string;
  amount: string;
  status: "PENDING" | "PAID" | "EXPIRED";
  expiresAt: number;
  transactionHash: string | null;
};

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function DirectUsdtPaymentPage() {
  const [order, setOrder] = useState<PendingOrder | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"amount" | "address" | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem("pendingOrder");
      const parsedOrder = savedOrder
        ? (JSON.parse(savedOrder) as PendingOrder)
        : null;
      if (
        !parsedOrder?.databaseId ||
        !parsedOrder.accessToken ||
        parsedOrder.paymentMethod?.toLowerCase() !== "usdt" ||
        Number(parsedOrder.totalAmount) <= 0
      ) {
        setOrder(null);
        return;
      }
      setOrder(parsedOrder);
    } catch {
      setOrder(null);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const checkPayment = useCallback(async () => {
    if (!order?.databaseId || !order.accessToken || !invoice) return;
    try {
      const params = new URLSearchParams({
        orderId: order.databaseId,
        accessToken: order.accessToken,
      });
      const response = await fetch(`/api/usdt/status?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        invoice?: Invoice;
        paymentStatus?: string;
        error?: string;
      };
      if (!response.ok || !result.invoice) {
        throw new Error(result.error ?? "Unable to check payment.");
      }
      setInvoice(result.invoice);
      if (
        result.invoice.status === "PAID" ||
        result.paymentStatus === "VERIFIED"
      ) {
        localStorage.setItem("latestOrder", JSON.stringify(order));
        window.location.href = "/checkout/success";
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to check payment.",
      );
    }
  }, [invoice, order]);

  useEffect(() => {
    if (!invoice || invoice.status !== "PENDING") return;
    const timer = window.setInterval(() => void checkPayment(), 8000);
    return () => window.clearInterval(timer);
  }, [checkPayment, invoice]);

  async function createInvoice(network: "TRC20" | "BEP20") {
    if (!order?.databaseId || !order.accessToken) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/usdt/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.databaseId,
          accessToken: order.accessToken,
          network,
        }),
      });
      const result = (await response.json()) as {
        invoice?: Invoice;
        error?: string;
      };
      if (!response.ok || !result.invoice) {
        throw new Error(result.error ?? "Unable to create USDT invoice.");
      }
      setInvoice(result.invoice);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create USDT invoice.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyValue(kind: "amount" | "address", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const secondsRemaining = useMemo(
    () => (invoice ? Math.max(0, invoice.expiresAt - now) : 0),
    [invoice, now],
  );

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto h-96 max-w-xl animate-pulse rounded-3xl bg-white/5" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-20 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-black">Payment unavailable</h1>
          <p className="mt-3 text-slate-400">
            Return to checkout and select Direct USDT.
          </p>
          <Link
            href="/checkout"
            className="mt-7 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950"
          >
            Return to Checkout
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white sm:py-20">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">
            Direct wallet payment
          </p>
          <h1 className="mt-3 text-3xl font-black">Pay with USDT</h1>
          <p className="mt-3 text-sm text-slate-400">
            Your payment is verified automatically on the blockchain.
          </p>
        </div>

        {!invoice ? (
          <div className="mt-8">
            <p className="text-center text-sm font-bold text-slate-300">
              Select the network you will send from
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void createInvoice("TRC20")}
                className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-left transition hover:border-red-300 disabled:opacity-50"
              >
                <span className="block text-lg font-black">USDT – TRC20</span>
                <span className="mt-1 block text-xs text-slate-400">
                  TRON network
                </span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void createInvoice("BEP20")}
                className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-left transition hover:border-amber-300 disabled:opacity-50"
              >
                <span className="block text-lg font-black">USDT – BEP20</span>
                <span className="mt-1 block text-xs text-slate-400">
                  BNB Smart Chain
                </span>
              </button>
            </div>
            {isSubmitting && (
              <p className="mt-4 text-center text-sm text-cyan-300">
                Creating secure invoice…
              </p>
            )}
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
              <span className="text-sm text-slate-400">Network</span>
              <span className="font-black text-cyan-300">
                USDT – {invoice.network}
              </span>
            </div>

            <UsdtQrCode
              address={invoice.address}
              network={invoice.network}
            />
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5 text-center">
              <p className="text-sm text-slate-400">Send exactly</p>
              <p className="mt-2 break-all text-3xl font-black text-cyan-300">
                {invoice.amount} USDT
              </p>
              <button
                type="button"
                onClick={() => void copyValue("amount", invoice.amount)}
                className="mt-3 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950"
              >
                {copied === "amount" ? "Copied" : "Copy amount"}
              </button>
            </div>

            <div className="rounded-2xl bg-slate-950 p-5">
              <p className="text-sm text-slate-400">Receiving address</p>
              <p className="mt-3 break-all font-mono text-sm font-bold text-white">
                {invoice.address}
              </p>
              <button
                type="button"
                onClick={() => void copyValue("address", invoice.address)}
                className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm font-black"
              >
                {copied === "address" ? "Copied" : "Copy address"}
              </button>
            </div>

            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              Send only USDT using {invoice.network}. The exact amount identifies
              your order. Sending another token, network, or amount can cause loss.
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Invoice expires in</span>
              <span className="font-mono text-lg font-black">
                {formatTime(secondsRemaining)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void checkPayment()}
              className="w-full rounded-xl bg-emerald-400 px-5 py-4 font-black text-slate-950"
            >
              I have sent the payment
            </button>
            <p className="text-center text-xs text-slate-500">
              Status updates automatically after blockchain confirmation.
            </p>
          </div>
        )}

        {message && (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {message}
          </p>
        )}

        <Link
          href="/checkout"
          className="mt-6 block text-center text-sm font-bold text-slate-400 hover:text-cyan-300"
        >
          Return to checkout
        </Link>
      </div>
    </main>
  );
}
