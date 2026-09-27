"use client";
import { useEffect, useRef, useState } from "react";
import type { GiftPortStatus } from "@/lib/giftport-types";
import { connectGiftPort, readGiftPortStatus, refreshGiftPort } from "./actions";
const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3";
const button = "rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50";
export default function GiftPortPanel({ initialStatus, initialError }: { initialStatus: GiftPortStatus | null; initialError: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(form?: HTMLFormElement) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("Checking your GiftPort connection…");
    try {
      const data = form ? new FormData(form) : null;
      form?.reset();
      const result = data ? await connectGiftPort(data) : await refreshGiftPort();
      if (result.error) throw new Error(result.error);
      for (let attempt = 0; attempt < 23 && mounted.current; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!mounted.current) return;
        const next = await readGiftPortStatus();
        if (!mounted.current) return;
        if (next.error) throw new Error(next.error);
        if (next.status) {
          setStatus(next.status);
          if (!next.status.syncing) {
            if (next.status.error) throw new Error(next.status.error);
            setMessage("Connected. Your catalogue and wallet balance are up to date.");
            return;
          }
        }
      }
      if (mounted.current) setMessage("The connection check is still running. Reload this page shortly to see the result.");
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : "Connection failed."); setMessage(""); }
    } finally { if (mounted.current) setBusy(false); }
  }
  const snapshot = status?.snapshot;
  const items = snapshot?.items.filter(i => `${i.brandName} ${i.operatorCode}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <div className="mt-6 space-y-6">
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <h2 className="text-lg font-bold">GiftPort API settings</h2>
      <p className="mt-2 text-sm">Use these details in your GiftPort account before connecting.</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div><dt className="font-bold">Server IP address</dt><dd className="mt-1 select-all">187.127.167.138</dd></div>
        <div><dt className="font-bold">Callback URL</dt><dd className="mt-1 break-all select-all">https://pally-relay.ingamepin.com/giftport/callback</dd></div>
      </dl>
      <a href="https://giftport.in/api_settings" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block font-bold text-blue-700">Open GiftPort API settings ↗</a>
    </section>
    <section className="rounded-2xl border p-5">
      <h2 className="text-lg font-bold">{status?.configured ? "Update connection" : "Connect GiftPort"}</h2>
      <p className="mt-2 text-sm text-slate-600">Keys are saved privately on your server after the connection succeeds. Updating keys replaces the connected account.</p>
      <form onSubmit={e => { e.preventDefault(); void run(e.currentTarget); }} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Client ID<input className={input} name="clientId" type="password" autoComplete="new-password" maxLength={512} required disabled={busy} /></label>
        <label className="text-sm font-semibold">Secret ID<input className={input} name="secretId" type="password" autoComplete="new-password" maxLength={512} required disabled={busy} /></label>
        <div className="sm:col-span-2"><button className={button} disabled={busy}>{busy ? "Checking…" : "Save and check connection"}</button></div>
      </form>
    </section>
    {(error || status?.error) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error || status?.error}</p>}
    {message && <p role="status" className="text-sm text-blue-700">{message}</p>}
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{status?.configured ? "Account connected" : "Awaiting credentials"}</h2>
        <button onClick={() => void run()} className={button} disabled={busy || !status?.configured}>Refresh balance and catalogue</button></div>
      {snapshot && <><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-600">GiftPort wallet balance{status?.stale ? " (last known)" : ""}</p><p className="mt-2 text-2xl font-bold">₹{Number(snapshot.balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-600">Catalogue brands</p><p className="mt-2 text-2xl font-bold">{snapshot.items.length}</p></div>
      </div><p className="mt-3 text-xs text-slate-500">Last checked: {new Date(snapshot.syncedAt * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST. Use Refresh to check again.</p></>}
      {status?.stale && status.configured && <p className="mt-3 text-sm text-amber-800">Supplier data is out of date. Refresh before using these figures.</p>}
      <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Automatic purchasing is not enabled. Connect your account first; supplier prices, product links and delivery verification still need to be set up.</p>
    </section>
    {snapshot && <section className="rounded-2xl border p-5"><h2 className="text-lg font-bold">Supplier catalogue</h2>
      <label className="mt-4 block text-sm">Search brands<input className={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Brand name or operator code" /></label>
      <p className="mt-3 text-sm text-slate-500">Denominations are face values, not your purchase cost. Stock quantities and wholesale prices are not supplied by this catalogue.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Brand</th><th className="p-3">Operator code</th><th className="p-3">Denominations</th><th className="p-3">Variable value</th></tr></thead>
        <tbody>{items.slice(0, 100).map(item => <tr key={item.operatorCode} className="border-b"><td className="p-3 font-semibold">{item.brandName}</td><td className="p-3">{item.operatorCode}</td><td className="max-w-sm p-3">{item.denominations.join(", ") || "Not provided"}</td><td className="p-3">{item.variable ? "Yes — confirm allowed range" : "No"}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-500">Showing {Math.min(items.length, 100)} of {items.length} matching brands.{items.length > 100 ? " Narrow your search to see other brands." : ""}</p>
    </section>}
  </div>;
}
