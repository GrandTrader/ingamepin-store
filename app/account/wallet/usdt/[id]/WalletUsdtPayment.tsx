"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import UsdtQrCode from "@/components/UsdtQrCode";
import UsdtComplianceWarning from "@/components/UsdtComplianceWarning";

type Invoice = {
  invoiceId: string;
  network: "TRC20" | "BEP20" | "SOLANA";
  address: string;
  amount: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "COMPLIANCE_HOLD";
  expiresAt: number;
};

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
}

export default function WalletUsdtPayment({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"amount" | "address" | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const checkPayment = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/wallet/topup/status?requestId=${encodeURIComponent(requestId)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        invoice?: Invoice;
        topupStatus?: string;
        error?: string;
      };

      if (!response.ok || !result.invoice) {
        throw new Error(result.error ?? "Unable to check payment.");
      }

      setInvoice(result.invoice);
      if (result.topupStatus === "APPROVED") {
        router.push("/account/wallet?success=Wallet+top-up+completed");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to check payment.",
      );
    }
  }, [requestId, router]);

  useEffect(() => {
    void checkPayment();
    const statusTimer = window.setInterval(() => void checkPayment(), 8000);
    const clockTimer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(clockTimer);
    };
  }, [checkPayment]);

  const remaining = useMemo(
    () => (invoice ? Math.max(0, invoice.expiresAt - now) : 0),
    [invoice, now],
  );

  async function copy(kind: "amount" | "address", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-8">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
            Wallet top-up
          </p>
          <h1 className="mt-3 text-3xl font-black">Pay with USDT</h1>
          <p className="mt-3 text-sm text-slate-400">
            Your wallet is credited automatically after blockchain
            confirmation.
          </p>
        </div>

        <UsdtComplianceWarning />

        {!invoice ? (
          <div className="mx-auto mt-8 h-80 animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <div className="mt-8 space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
              <span className="text-sm text-slate-400">Network</span>
              <strong className="text-cyan-300">
                USDT - {invoice.network}
              </strong>
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
                onClick={() => void copy("amount", invoice.amount)}
                className="mt-3 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950"
              >
                {copied === "amount" ? "Copied" : "Copy amount"}
              </button>
            </div>
            <div className="rounded-2xl bg-slate-950 p-5">
              <p className="text-sm text-slate-400">Receiving address</p>
              <p className="mt-3 break-all font-mono text-sm font-bold">
                {invoice.address}
              </p>
              <button
                type="button"
                onClick={() => void copy("address", invoice.address)}
                className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm font-black"
              >
                {copied === "address" ? "Copied" : "Copy address"}
              </button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Invoice expires in</span>
              <strong className="font-mono text-lg">
                {formatTime(remaining)}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => void checkPayment()}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-5 py-3 font-black text-white transition hover:border-cyan-300 hover:text-cyan-300"
            >
              Check payment status
            </button>
            <p className="text-center text-xs text-slate-500">
              Payment status is checked automatically every few seconds.
            </p>
          </div>
        )}

        {message && (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {message}
          </p>
        )}
        <Link
          href="/account/wallet"
          className="mt-6 block text-center text-sm font-bold text-slate-400"
        >
          Return to wallet
        </Link>
      </div>
    </main>
  );
}
