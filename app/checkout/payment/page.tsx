"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PendingOrder = {
  id: string;
  databaseId?: string;
  accessToken?: string;
  paymentMethod?: string;
  totalAmount: number;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function PaymentPage() {
  const [order, setOrder] = useState<PendingOrder | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem("pendingOrder");
      const parsedOrder = savedOrder
        ? (JSON.parse(savedOrder) as PendingOrder)
        : null;

      if (
        !parsedOrder?.databaseId ||
        !parsedOrder.accessToken ||
        !parsedOrder.paymentMethod?.toLowerCase().includes("binance") ||
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

  async function openBinancePay() {
    if (!order?.databaseId || !order.accessToken) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/binance-pay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.databaseId,
          accessToken: order.accessToken,
        }),
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error ?? "Unable to open Binance Pay.");
      }

      localStorage.setItem("latestOrder", JSON.stringify(order));
      window.location.href = result.checkoutUrl;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to open Binance Pay.",
      );
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto h-64 max-w-xl animate-pulse rounded-3xl bg-white/5" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-20 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-black">Payment unavailable</h1>
          <p className="mt-3 text-slate-400">
            Return to checkout and select Binance Pay.
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
    <main className="min-h-screen bg-slate-950 px-4 py-20 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">
          Binance Pay
        </p>
        <h1 className="mt-3 text-3xl font-black">
          Pay securely with Binance
        </h1>
        <p className="mt-3 text-slate-400">
          Binance will calculate the supported cryptocurrency amount from your
          USD order total.
        </p>
        <div className="mt-6 rounded-2xl bg-slate-950 p-5">
          <p className="text-sm text-slate-500">Order total</p>
          <p className="mt-2 text-3xl font-black text-cyan-400">
            {formatPrice(order.totalAmount)}
          </p>
        </div>
        {message && (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={() => void openBinancePay()}
          disabled={isSubmitting}
          className="mt-6 w-full rounded-xl bg-amber-300 px-5 py-4 font-black text-slate-950 disabled:opacity-60"
        >
          {isSubmitting ? "Opening Binance Pay..." : "Continue to Binance Pay"}
        </button>
        <Link
          href="/checkout"
          className="mt-4 block text-sm font-bold text-slate-400 hover:text-cyan-300"
        >
          Return to checkout
        </Link>
      </div>
    </main>
  );
}
