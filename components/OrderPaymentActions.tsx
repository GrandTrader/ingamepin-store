"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { checkoutDeadline } from "@/lib/checkout-expiry";

type Props = { orderNumber: string; status: string; paymentStatus?: string; paymentMethod?: string;
  createdAt: string; expiresAt?: string | null; expiredAt?: string | null; total: number; currency: string };

export default function OrderPaymentActions(props: Props) {
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<{ choices: { value: string; method: string; label: string; total: number; fee: number }[]; revision: number } | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const pending = props.status === "PENDING_PAYMENT" && (!props.paymentStatus || props.paymentStatus === "PENDING");
  const cancelled = props.status === "CANCELLED" && props.paymentStatus === "FAILED";
  if (!pending && !cancelled) return null;
  const remaining = now === null ? null : Math.max(0, Math.ceil((checkoutDeadline(props.createdAt, props.expiresAt) - now) / 1000));
  const ended = remaining === 0 || cancelled;
  const choice = options?.choices.find(item => item.value === selected);
  const wallet = choice?.method === "WALLET";
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: props.currency }).format(value);
  async function showOptions() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders/retry-payment", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: props.orderNumber, action: "options" }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load payment options.");
      if (result.paid && result.receiptUrl) { window.location.assign(result.receiptUrl); return; }
      if (!result.choices?.length) throw Error("No payment methods are available. Please contact support.");
      setOptions(result); setSelected(result.selected);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load payment options."); }
    finally { setBusy(false); }
  }
  async function retry() {
    if (!choice || !options) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders/retry-payment", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: props.orderNumber, action: wallet ? "pay-wallet" : "retry",
          paymentMethod: choice.value, expectedTotal: choice.total, revision: options.revision }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to retry payment.");
      if (result.paid && result.receiptUrl) { window.location.assign(result.receiptUrl); return; }
      if (!result.pendingOrder || !result.nextUrl) throw Error("Unable to open this payment.");
      localStorage.setItem("pendingOrder", JSON.stringify(result.pendingOrder));
      localStorage.setItem("latestOrder", JSON.stringify(result.pendingOrder));
      window.location.assign(result.nextUrl);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to retry payment."); setBusy(false); }
  }
  return <section className="mt-4 rounded-xl border border-cyan-300 bg-cyan-50 p-4 text-slate-900">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-bold">{ended ? (props.expiredAt || !cancelled ? "Payment window ended" : "Payment unsuccessful") : "Complete your payment"}</h2>
        <p className="mt-1 text-sm">{cancelled
          ? "This unpaid order no longer uses your purchase limit. You can create a new order."
          : ended ? "Unpaid orders expire after 15 minutes. Payments already submitted are checked separately."
          : "Choose how to pay this order. Your original 15-minute payment deadline stays the same."}</p>
        {!ended && <p className="mt-1 text-sm font-bold" aria-live="off">{remaining === null ? "Payment window: 15 minutes from ordering" : `Time left: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</p>}
      </div>
      {ended ? <Link href="/checkout" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">Return to checkout</Link>
        : <button type="button" disabled={busy || now === null} onClick={() => void showOptions()} className="min-h-11 shrink-0 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
          {busy ? "Please wait…" : options ? "Refresh payment options" : "Retry / change payment"}
        </button>}
    </div>
    {!ended && options && <div className="mt-4 border-t border-cyan-200 pt-4">
      <label htmlFor="retry-payment-method" className="block text-sm font-bold">Payment method</label>
      <select id="retry-payment-method" value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 sm:max-w-md">
        {options.choices.map(item => <option key={item.value} value={item.value}>{item.label} · {money(item.total)}</option>)}
      </select>
      {choice && <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-bold">Total to pay: {money(choice.total)}</p>
          <p className="text-sm">Payment fee included: {money(choice.fee)}</p></div>
        <button type="button" disabled={busy} onClick={() => void retry()}
          className="min-h-11 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
          {busy ? "Opening payment…" : wallet ? "Pay " + money(choice.total) + " with wallet" : "Continue to " + choice.label}
        </button>
      </div>}
      <p className="mt-3 text-xs">After changing methods, use only the new payment instructions. If you have already paid, contact support before trying again.</p>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {ended && <p className="mt-2 text-xs">Already paid? Keep your payment reference and contact support before paying again.</p>}
  </section>;
}
