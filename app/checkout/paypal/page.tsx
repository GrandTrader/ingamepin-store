"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PaymentAccess = { orderId: string; accessToken: string; paypalOrderId: string };

export default function PayPalReturnPage() {
  const [access, setAccess] = useState<PaymentAccess | null>(null);
  const [message, setMessage] = useState("Checking your payment…");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const started = useRef(false);
  const active = useRef(false);
  const confirm = useCallback(async (payment: PaymentAccess) => {
    if (active.current) return;
    active.current = true; setBusy(true);
    try {
      const response = await fetch("/api/paypal/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", ...payment }), signal: AbortSignal.timeout(55_000) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to confirm payment yet.");
      if (result.status === "COMPLETED") {
        setPaid(true); setMessage("Your PayPal payment is confirmed. Your order is being prepared.");
      } else setMessage("PayPal has not confirmed the payment yet. Check again before paying a second time.");
    } catch (error) {
      setMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Confirmation is taking longer than expected. Check again before paying a second time.");
    } finally { active.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const orderId = url.searchParams.get("order");
    const token = url.searchParams.get("token");
    const cancelled = url.searchParams.get("cancelled") === "1";
    // Keep only the non-secret order reference in browser history.
    url.searchParams.delete("token"); url.searchParams.delete("PayerID");
    window.history.replaceState({}, "", url.pathname + url.search);
    try {
      const pending = JSON.parse(localStorage.getItem("pendingOrder") || "null");
      const saved = JSON.parse(sessionStorage.getItem(`igp-paypal-${orderId}`) || "null");
      if (pending?.databaseId !== orderId || pending?.paymentMethod !== "paypal" || !pending?.accessToken ||
          saved?.orderId !== orderId || (token && saved.paypalOrderId !== token) || !saved.paypalOrderId) {
        setMessage("Open Purchases or contact support to check your order. Do not pay again until its status is confirmed."); return;
      }
      const payment = { orderId: orderId!, accessToken: pending.accessToken, paypalOrderId: saved.paypalOrderId };
      setAccess(payment);
      if (cancelled) setMessage("You returned from PayPal without completing checkout. You can check the payment status below.");
      else void confirm(payment);
    } catch { setMessage("Open Purchases or contact support to check your order status."); }
  }, [confirm]);

  return <main className="mx-auto max-w-xl px-4 py-12 text-slate-900">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-blue-700">PayPal</p>
      <h1 className="mt-3 text-2xl font-black">{paid ? "Payment received" : "Payment status"}</h1>
      <p role="status" className="mt-4 text-sm leading-6 text-slate-600">{message}</p>
      {access && !paid && <button type="button" disabled={busy} onClick={() => void confirm(access)}
        className="mt-5 w-full rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Checking…" : "Check payment status"}</button>}
      <Link href="/track-order" className="mt-5 block font-bold text-blue-700">View purchases</Link>
      {!paid && <Link href="/checkout/payment" className="mt-4 block text-sm text-slate-600">Return to payment</Link>}
      <p className="mt-6 text-sm text-slate-500">Need help? <a href="mailto:support@ingamepin.com" className="underline">support@ingamepin.com</a></p>
    </section>
  </main>;
}
