"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Purchase = { order_number: string; status: string; total: number; currency: string; created_at: string };
type Props = { onSelect: (orderNumber: string, email: string) => void; onClear: () => void; verificationRequired: boolean };

export default function PurchaseVerification({ onSelect, onClear, verificationRequired }: Props) {
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

  const loadOrders = useCallback(async (nextPage = 1) => {
    const response = await fetch(`/api/orders/lookup?page=${nextPage}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) { setVerified(false); setOrders([]); }
      throw Error(data.error || "Unable to load purchases.");
    }
    setOrders(data.orders); setPage(nextPage); setHasMore(data.hasMore);
    setEmail(data.email); setVerified(true); setAccount(data.source === "account");
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const response = await fetch("/api/orders/verification", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw Error(data.error || "Unable to check verification.");
        if (data.verified) await loadOrders();
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "Unable to load purchases."); }
      finally { if (active) setBusy(false); }
    }
    void initialize();
    return () => { active = false; };
  }, [loadOrders]);

  useEffect(() => {
    if (!verificationRequired) return;
    // Do not keep previous purchase details when server-side access has expired.
    const timer = window.setTimeout(() => { setVerified(false); setOrders([]); setSent(false); setCode(""); setMessage("Your session expired. Verify your email again."); }, 0);
    return () => window.clearTimeout(timer);
  }, [verificationRequired]);

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
      else { onClear(); setCode(""); setSent(false); await loadOrders(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to verify email."); }
    finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/orders/verification", { method: "DELETE" });
      if (!response.ok) throw Error("Unable to end this session. Please retry.");
      setVerified(false); setEmail(""); setOrders([]); setSent(false); setCode(""); onClear();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to end session."); }
    finally { setBusy(false); }
  }

  async function changePage(value: number) {
    setBusy(true); setMessage("");
    try { await loadOrders(value); }
    catch (error) { onClear(); setMessage(error instanceof Error ? error.message : "Unable to load purchases."); }
    finally { setBusy(false); }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400";
  return <section className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:p-6" aria-busy={busy}>
    {!verified ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (!busy) void verify(sent ? "verify" : "send"); }} className="mx-auto max-w-md space-y-4">
      <label className="block text-sm font-bold">Purchase email<input className={inputClass} type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoComplete="email" readOnly={sent} /></label>
      {sent && <label className="block text-sm font-bold">Verification code<input className={`${inputClass} text-center text-xl tracking-[0.3em]`} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /><span className="mt-2 block text-xs font-normal text-slate-400">Enter the six-digit code sent to your email. It expires in 10 minutes.</span></label>}
      <button disabled={busy} className="track-order-primary-action w-full rounded-xl px-5 py-3 font-bold disabled:opacity-50">{busy ? "Please wait..." : sent ? "Verify and view purchases" : "Send verification code"}</button>
      {sent && <div className="flex justify-between gap-3 text-sm"><button type="button" disabled={busy || cooldown > 0} onClick={() => void verify("send")} className="p-2 text-cyan-400 disabled:opacity-50">{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button><button type="button" disabled={busy} className="p-2" onClick={() => { setSent(false); setCode(""); setMessage(""); }}>Change email</button></div>}
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Your purchases</h2><p className="break-all text-sm text-slate-400">{email}</p></div>{!account && <button type="button" onClick={() => void endSession()} disabled={busy} className="rounded-lg border border-white/20 px-3 py-2 text-sm">End session</button>}</div>
      <form className="my-4 flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); if (search.trim()) onSelect(search.trim().toUpperCase(), email); }}><input aria-label="Order number" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="Find an order number" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-3" /><button disabled={busy || !search.trim()} className="track-order-primary-action rounded-xl px-4 py-3 font-bold disabled:opacity-50">Check order</button></form>
      {orders.length ? <div className="divide-y divide-white/10">{orders.map(order => <button key={order.order_number} onClick={() => onSelect(order.order_number, email)} disabled={busy} className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left"><span className="min-w-0"><span className="block break-all font-bold text-cyan-400">{order.order_number}</span><span className="text-xs text-slate-400">{new Date(order.created_at).toLocaleDateString()} · {order.status.replaceAll("_", " ")}</span></span><span className="text-sm font-bold">{new Intl.NumberFormat("en", { style: "currency", currency: order.currency || "USD" }).format(Number(order.total))} <span aria-hidden="true">→</span></span></button>)}</div> : <p className="py-5 text-sm text-slate-400">No purchases found for this email.</p>}
      {(page > 1 || hasMore) && <div className="mt-4 flex items-center justify-between gap-2 text-sm"><button disabled={busy || page === 1} onClick={() => void changePage(page - 1)} className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={busy || !hasMore} onClick={() => void changePage(page + 1)} className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Next</button></div>}
    </>}
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-800 p-3 text-sm text-slate-200">{message}</p>}
  </section>;
}
