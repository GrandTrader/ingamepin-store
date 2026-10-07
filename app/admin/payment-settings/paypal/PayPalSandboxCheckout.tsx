"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TestOrder = { orderId: string; sessionToken: string; approvalUrl?: string };
type Verification = { status: string; captureId: string; environment: string; amount: string; currency: string };
const STORAGE_KEY = "igp-paypal-sandbox";

async function testRequest<T>(body: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("/api/admin/paypal/sandbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The PayPal test could not be completed.");
    return result as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("PayPal took too long to respond. If you approved a payment, use Verify payment before starting another test.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export default function PayPalSandboxCheckout() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Verification | null>(null);
  const [hasOrder, setHasOrder] = useState(false);
  const active = useRef(false);
  const returned = useRef(false);
  const order = useRef<TestOrder | null>(null);

  const verify = useCallback(async () => {
    if (!order.current || active.current) return;
    active.current = true;
    setBusy(true); setMessage("");
    try {
      const verified = await testRequest<Verification>({ action: "capture", sessionToken: order.current.sessionToken });
      if (verified.status !== "COMPLETED" || verified.environment !== "sandbox") throw new Error("The test payment is not confirmed yet.");
      setResult(verified);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage availability does not change a confirmed payment. */ }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to verify the test payment.");
    } finally { active.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    if (returned.current) return;
    returned.current = true;
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("paypal");
    const returnedOrderId = url.searchParams.get("token");
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as TestOrder | null;
      if (typeof saved?.orderId === "string" && typeof saved.sessionToken === "string") { order.current = saved; setHasOrder(true); }
    } catch { /* Starting a test below checks storage before leaving the page. */ }
    if (outcome) {
      for (const key of ["paypal", "token", "PayerID"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url.href);
      if (outcome === "cancelled") setMessage("Test cancelled. No payment was confirmed.");
      else if (outcome === "approved") {
        if (!order.current || returnedOrderId !== order.current.orderId) setMessage("This return does not match your saved test. Use Verify payment to check your saved payment.");
        else void verify();
      }
    }
  }, [verify]);

  async function start() {
    if (active.current) return;
    active.current = true;
    setBusy(true); setMessage(""); setResult(null);
    try {
      // Persist the signed session before navigating, so returning can verify the same order.
      try { sessionStorage.setItem(`${STORAGE_KEY}-check`, "1"); sessionStorage.removeItem(`${STORAGE_KEY}-check`); }
      catch { throw new Error("Enable browser storage for this site before starting the PayPal test."); }
      const created = await testRequest<TestOrder>({ action: "create" });
      const approvalUrl = new URL(created.approvalUrl ?? "about:blank");
      if (!created.sessionToken || !["https://www.sandbox.paypal.com", "https://sandbox.paypal.com"].includes(approvalUrl.origin)
        || approvalUrl.username || approvalUrl.password || approvalUrl.searchParams.get("token") !== created.orderId) {
        throw new Error("PayPal did not return a valid Sandbox checkout link.");
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(created));
      order.current = created; setHasOrder(true);
      window.location.assign(approvalUrl.href);
    } catch (error) {
      active.current = false; setBusy(false);
      setMessage(error instanceof Error ? error.message : "Unable to open PayPal. Please try again.");
    }
  }

  return <>
    {result ? <div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><strong>Sandbox payment successful</strong><p>PayPal confirmed {result.amount} {result.currency} in test funds.</p><p className="break-all">Transaction: {result.captureId}</p><p>No real products were delivered.</p></div> : <>
      <button type="button" disabled={busy} onClick={() => void start()} className="w-full rounded-xl bg-[#ffc439] px-5 py-3 font-bold text-[#003087] disabled:opacity-50">{busy ? "Connecting to PayPal…" : "PayPal · Pay $1.00 in Sandbox"}</button>
      <p className="mt-3 text-center text-sm text-slate-600">Continue securely on PayPal, then return here to confirm the test.</p>
      {hasOrder && <button type="button" disabled={busy} onClick={() => void verify()} className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold disabled:opacity-50">Verify payment</button>}
    </>}
    {message && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{message}</p>}
  </>;
}
