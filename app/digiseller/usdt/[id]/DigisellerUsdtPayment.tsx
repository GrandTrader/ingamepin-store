"use client";

import { useCallback, useEffect, useState } from "react";

import UsdtQrCode from "@/components/UsdtQrCode";

type Invoice = {
  invoiceId: string;
  network: "TRC20" | "BEP20" | "SOLANA";
  address: string;
  amount: string;
  status: "PENDING" | "PAID" | "EXPIRED";
  expiresAt: number;
  transactionHash: string | null;
};

export default function DigisellerUsdtPayment({
  invoiceId,
  token,
}: {
  invoiceId: string;
  token: string;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [returnUrl, setReturnUrl] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/digiseller/usdt?invoice_id=${encodeURIComponent(invoiceId)}&token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      invoice?: Invoice;
      returnUrl?: string | null;
      error?: string;
    };
    if (!response.ok || !result.invoice) {
      throw new Error(result.error ?? "Unable to load payment.");
    }
    setInvoice(result.invoice);
    setReturnUrl(result.returnUrl ?? "");
    if (result.invoice.status === "PAID" && result.returnUrl) {
      window.location.replace(result.returnUrl);
}
  }, [invoiceId, token]);

  useEffect(() => {
    void refresh().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to load payment."),
    );
  }, [refresh]);

  useEffect(() => {
    if (!invoice || invoice.status !== "PENDING") return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [invoice, refresh]);

  return (
    <main className="min-h-screen bg-[#08162f] px-4 py-10 text-white">
      <section className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-[#132541] p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
          Digiseller secure payment
        </p>
        <h1 className="mt-2 text-3xl font-black">
          Pay with USDT {invoice?.network ?? ""}
        </h1>
        {error ? (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </p>
        ) : !invoice ? (
          <p className="mt-6 text-sm text-slate-300">Loading paymentâ€¦</p>
        ) : (
          <div className="mt-6 space-y-5">
            <UsdtQrCode address={invoice.address} network={invoice.network} />
            <div className="rounded-2xl bg-[#091831] p-4">
              <p className="text-xs text-slate-400">Exact amount</p>
              <p className="mt-1 text-2xl font-black text-cyan-400">{invoice.amount} USDT</p>
            </div>
            <div className="rounded-2xl bg-[#091831] p-4">
              <p className="text-xs text-slate-400">Receiving address</p>
              <p className="mt-2 break-all text-sm font-bold">{invoice.address}</p>
            </div>
            <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              Send only USDT on {invoice.network}. The payment is detected automatically.
            </p>
            <p className="text-center text-sm text-slate-300">
              Status: <strong>{invoice.status}</strong>
            </p>
            {invoice.status === "PAID" && returnUrl ? (
              <a
                href={returnUrl}
                className="block rounded-xl bg-cyan-400 px-5 py-3 text-center font-black text-slate-950"
              >
                Return to Digiseller
              </a>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}