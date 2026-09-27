"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GiftPortItem, GiftPortMapping } from "@/lib/giftport-types";
import { giftPortAmountAllowed } from "@/lib/giftport-import";
import { searchGiftPort, saveGiftPortLink } from "./link-actions";

export default function GiftPortOptionEditor({ productId, option, mapping }: {
  productId: string; option: { id: string; option_name: string | null; denomination: number; denomination_currency: string | null; selling_price: number | null }; mapping: GiftPortMapping | null;
}) {
  const [query, setQuery] = useState(""); const [items, setItems] = useState<GiftPortItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null); const [stale, setStale] = useState(false);
  const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition(); const router = useRouter();
  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => { void searchGiftPort(query).then(r => { if (active) { setItems(r.items); setStale(!!r.stale); setMessage(r.error || (r.stale ? "Refresh the GiftPort catalogue before saving." : r.items.length ? "" : "No matching brands.")); } }).catch(() => { if (active) setMessage("Search unavailable. Try again."); }); }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  function save(code: string | null) { startTransition(async () => { try { const r = await saveGiftPortLink(productId, option.id, code); setMessage(r.error || (code ? "GiftPort link saved." : "GiftPort link removed.")); if (r.success) { setQuery(""); setItems([]); setSelected(null); router.refresh(); } } catch { setMessage("The link could not be confirmed. Reload to check before retrying."); } }); }
  const changed = mapping && (Number(mapping.amount) !== Number(option.denomination) || mapping.currency !== option.denomination_currency || !mapping.supplier || !giftPortAmountAllowed(mapping.supplier, mapping.amount));
  return <article className="rounded-xl border p-4"><h3 className="font-black">{option.option_name || option.denomination}</h3><p className="mt-1 text-sm text-slate-500">Face value: {option.denomination} {option.denomination_currency} · Selling price: USD {Number(option.selling_price || 0).toFixed(2)}</p>
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{mapping ? <><strong>{mapping.supplier?.brandName || mapping.operator_code}</strong><p className="mt-1">{mapping.operator_code} · {mapping.amount} {mapping.currency}</p>{changed && <p className="mt-2 text-amber-800">The option or supplier values changed. Review and save the link again.</p>}</> : "No GiftPort link saved."}</div>
    <label className="mt-4 block text-sm font-semibold">Search GiftPort brand or operator code<input value={query} disabled={pending} onChange={e => { setQuery(e.target.value); setItems([]); setSelected(null); setStale(false); setMessage(""); }} className="mt-2 w-full rounded-lg border px-3 py-2" placeholder="For example: Amazon Pay" /></label>
    {items.length > 0 && <div className="mt-3 max-h-72 space-y-2 overflow-auto">{items.map(item => { const allowed = option.denomination_currency === "INR" && giftPortAmountAllowed(item, String(option.denomination)); return <label key={item.operatorCode} className={`flex gap-3 rounded-lg border p-3 text-sm ${selected === item.operatorCode ? "border-blue-600 bg-blue-50" : ""}`}><input type="radio" name={`giftport-${option.id}`} checked={selected === item.operatorCode} disabled={!allowed || stale || pending} onChange={() => setSelected(item.operatorCode)} /><div><strong>{item.brandName}</strong><p className="mt-1 text-slate-500">{item.operatorCode} · {item.country} · {item.deliveryType}</p>{!allowed && <p className="mt-1 text-amber-800">This brand does not confirm the option’s INR face value.</p>}</div></label>; })}</div>}
    <div className="mt-4 flex gap-3"><button type="button" disabled={pending || !selected || stale} onClick={() => selected && save(selected)} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-40">Save GiftPort link</button>{mapping && <button type="button" disabled={pending} onClick={() => save(null)} className="rounded-lg border px-4 py-2 font-bold text-red-700">Remove link</button>}</div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </article>;
}
