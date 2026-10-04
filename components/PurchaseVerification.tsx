"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { purchaseHref, validOrderReference } from "@/lib/purchase-navigation";
import { usePurchaseNavigation } from "@/components/PurchaseNavigation";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Purchase = { order_number: string; status: string; total: number; currency: string; created_at: string };
type Props = { requestedOrder?: string; initialPage?: number };

function orderStatus(status: string) {
  if (status === "DELIVERED") return { label: "Completed", style: "track-order-status-success" };
  if (status === "CANCELLED" || status === "REFUNDED") return { label: status === "CANCELLED" ? "Cancelled" : "Refunded", style: "track-order-status-danger" };
  return { label: status === "PENDING_PAYMENT" ? "Awaiting payment" : status.replaceAll("_", " ").toLowerCase(), style: "track-order-status-warning" };
}

export default function PurchaseVerification({ requestedOrder, initialPage = 1 }: Props) {
  const router = useRouter();
  const { position, setPosition } = usePurchaseNavigation();
  const sectionRef = useRef<HTMLElement>(null);
  const previousPosition = position?.page === initialPage ? position : null;
  const [initialState, setInitialState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  function rememberPosition() {
    if (sectionRef.current) setPosition({ page, height: sectionRef.current.offsetHeight, scroll: window.scrollY, width: window.innerWidth });
  }

  useLayoutEffect(() => {
    if (position?.page === initialPage && position.width === window.innerWidth) {
      window.scrollTo({ top: position.scroll, behavior: "instant" });
    }
  }, [position, initialPage]);
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);
  const [account, setAccount] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [search, setSearch] = useState("");

  const loadOrders = useCallback(async (nextPage = 1, signal?: AbortSignal) => {
    const response = await fetch(`/api/orders/lookup?page=${nextPage}`, { cache: "no-store", signal });
    const data = await response.json();
    if (signal?.aborted) return false;
    if (!response.ok) {
      if (response.status === 401) { setVerified(false); setOrders([]); setPosition(null); return false; }
      throw Error(data.error || "Unable to load purchases.");
    }
    setOrders(data.orders); setPage(nextPage); setHasMore(data.hasMore);
    setEmail(data.email); setVerified(true); setAccount(data.source === "account");
    return true;
  }, [setPosition, setVerified, setOrders, setPage, setHasMore, setEmail, setAccount]);

  useEffect(() => {
    const controller = new AbortController();
    async function initialize() {
      try {
        if (requestedOrder) {
          const response = await fetch("/api/orders/verification", { cache: "no-store", signal: controller.signal });
          const data = await response.json();
          if (controller.signal.aborted) return;
          if (!response.ok) throw Error(data.error || "Unable to check verification.");
          if (data.verified) { router.replace(purchaseHref(requestedOrder, initialPage)); return; }
        } else {
          await loadOrders(initialPage, controller.signal);
        }
        if (!controller.signal.aborted) { setInitialState("ready"); setBusy(false); }
      } catch (error) {
        if (!controller.signal.aborted) {
          setInitialState("error"); setBusy(false);
          setMessage(error instanceof Error ? error.message : "Unable to load purchases.");
        }
      }
    }
    void initialize();
    return () => controller.abort();
  }, [loadOrders, requestedOrder, initialPage, router, retry]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verify(action: "send" | "verify") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/orders/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, code }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to verify email.");
      if (action === "send") { setSent(true); setCode(""); setCooldown(data.retryAfter || 60); setMessage(data.message); }
      else {
        setCode(""); setSent(false);
        if (requestedOrder) { setInitialState("loading"); router.replace(purchaseHref(requestedOrder, initialPage)); }
        else await loadOrders(initialPage);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to verify email."); }
    finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/orders/verification", { method: "DELETE" });
      if (!response.ok) throw Error("Unable to end this session. Please retry.");
      setPosition(null); setVerified(false); setEmail(""); setOrders([]); setSent(false); setCode("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to end session."); }
    finally { setBusy(false); }
  }

  async function changePage(value: number) {
    setBusy(true); setMessage("");
    try { await loadOrders(value); window.history.replaceState(null, "", value > 1 ? `/track-order?page=${value}` : "/track-order"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load purchases."); }
    finally { setBusy(false); }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400";
  return <section ref={sectionRef} style={initialState !== "ready" ? { minHeight: previousPosition?.height ?? 420 } : undefined} className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:p-6" aria-busy={busy}>
    {initialState !== "ready" ? <div role="status" aria-live="polite">
      <p className="text-sm font-bold">{initialState === "error" ? "Unable to load purchases." : "Loading purchases..."}</p>
      {initialState === "error" ? <button type="button" className="track-order-primary-action mt-4 min-h-11 rounded-xl px-4 text-sm font-bold" onClick={() => { setInitialState("loading"); setMessage(""); setBusy(true); setRetry(value => value + 1); }}>Try again</button> : <div aria-hidden="true" className="mt-5 space-y-3"><div className="h-11 rounded-xl bg-slate-800" />{[0, 1, 2].map(row => <div key={row} className="h-24 rounded-xl bg-slate-800 sm:h-16" />)}</div>}
    </div> : !verified ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (!busy) void verify(sent ? "verify" : "send"); }} className="mx-auto max-w-md space-y-4">
      <label className="block text-sm font-bold">Purchase email<input className={inputClass} type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoComplete="email" readOnly={sent} /></label>
      {sent && <label className="block text-sm font-bold">Verification code<input className={`${inputClass} text-center text-xl tracking-[0.3em]`} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /><span className="mt-2 block text-xs font-normal text-slate-400">Enter the six-digit code sent to your email. It expires in 10 minutes.</span></label>}
      <button disabled={busy} className="track-order-primary-action w-full rounded-xl px-5 py-3 font-bold disabled:opacity-50">{busy ? "Please wait..." : sent ? "Verify and view purchases" : "Send verification code"}</button>
      {sent && <div className="flex justify-between gap-3 text-sm"><button type="button" disabled={busy || cooldown > 0} onClick={() => void verify("send")} className="p-2 text-cyan-400 disabled:opacity-50">{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button><button type="button" disabled={busy} className="p-2" onClick={() => { setSent(false); setCode(""); setMessage(""); }}>Change email</button></div>}
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-bold">Your purchases</h2><p className="break-all text-xs text-slate-400">{email}</p></div>
        {!account && <button type="button" onClick={() => void endSession()} disabled={busy} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm">End session</button>}
      </div>
      <form className="my-4 flex gap-2" onSubmit={event => {
        event.preventDefault();
        const reference = validOrderReference(search);
        if (reference) { rememberPosition(); router.push(purchaseHref(reference, page)); }
        else setMessage("Enter a valid order number.");
      }}>
        <input aria-label="Order number" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="Find an order number" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm" />
        <button disabled={busy || !search.trim()} className="track-order-primary-action shrink-0 rounded-xl px-3 py-3 text-sm font-bold disabled:opacity-50">Check order</button>
      </form>
      {orders.length ? <div>
        <div aria-hidden="true" className="mb-2 hidden grid-cols-[minmax(0,1fr)_10rem_7rem_1rem] gap-4 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid"><span>Order / Date</span><span>Status</span><span className="text-right">Total</span><span /></div>
        <div className="space-y-2">{orders.map(order => {
          const status = orderStatus(order.status);
          return <Link key={order.order_number} href={purchaseHref(order.order_number, page)} prefetch={false} onNavigate={rememberPosition}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-[var(--surface-page)] p-3 transition hover:border-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-400 sm:grid-cols-[minmax(0,1fr)_10rem_7rem_1rem] sm:gap-4 sm:px-4"
            aria-label={`Open order ${order.order_number}`}>
            <span className="col-start-1 row-start-1 min-w-0"><span className="track-order-accent-text block break-all text-sm font-bold">{order.order_number}</span><span className="mt-1 block text-xs text-slate-400">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(order.created_at))}</span></span>
            <span className={`col-start-1 row-start-2 w-fit rounded-full px-2.5 py-1 text-[11px] font-bold capitalize sm:col-start-2 sm:row-start-1 ${status.style}`}>{status.label}</span>
            <span className="col-start-2 row-start-1 text-right text-sm font-bold sm:col-start-3">{new Intl.NumberFormat("en", { style: "currency", currency: order.currency || "USD" }).format(Number(order.total))}</span>
            <span aria-hidden="true" className="col-start-2 row-start-2 text-right text-cyan-400 sm:col-start-4 sm:row-start-1">→</span>
          </Link>;
        })}</div>
      </div> : <p className="py-5 text-sm text-slate-400">No purchases found for this email.</p>}
      {(page > 1 || hasMore) && <div className="mt-4 flex items-center justify-between gap-2 text-sm"><button disabled={busy || page === 1} onClick={() => void changePage(page - 1)} className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={busy || !hasMore} onClick={() => void changePage(page + 1)} className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Next</button></div>}
    </>}
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-800 p-3 text-sm text-slate-200">{message}</p>}
  </section>;
}
