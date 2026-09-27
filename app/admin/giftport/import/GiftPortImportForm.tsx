"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { GiftPortItem } from "@/lib/giftport-types";
import { giftPortAmount, giftPortAmountAllowed } from "@/lib/giftport-import";
import { importGiftPortProduct } from "./actions";
import { calculateGiftPortPrices } from "./pricing-actions";
import { createSupplierImportCategory } from "@/app/admin/definiteplay/import/category-actions";

export default function GiftPortImportForm({ item, categories: initialCategories, requestId }: { item: GiftPortItem; categories: { id: string; name: string }[]; requestId: string }) {
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState("GIFT_CARD");
  const [amounts, setAmounts] = useState(item.denominations);
  const [selected, setSelected] = useState(item.denominations.filter(v => Number.isSafeInteger(Number(v))).slice(0, 50));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [markup, setMarkup] = useState("0");
  const [pricingMessage, setPricingMessage] = useState("");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3";
  function addValue() {
    try {
      const amount = giftPortAmount(custom);
      if (!Number.isSafeInteger(Number(amount)) || !giftPortAmountAllowed(item, amount)) throw new Error("Choose a whole-number value inside the supplier’s confirmed range.");
      if (selected.length >= 50 && !selected.includes(amount)) throw new Error("Select no more than 50 denominations per import.");
      if (!amounts.includes(amount)) setAmounts([...amounts, amount].sort((a, b) => Number(a) - Number(b)));
      if (!selected.includes(amount)) setSelected([...selected, amount]);
      setCustom(""); setMessage("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Check the value."); }
  }
  return <form className="mt-6 space-y-6" onSubmit={e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await importGiftPortProduct({ requestId, categoryId, operatorCode: item.operatorCode,
          title: String(data.get("title") || ""), titleRu: String(data.get("titleRu") || ""),
          description: String(data.get("description") || ""), descriptionRu: String(data.get("descriptionRu") || ""),
          options: selected.map(amount => ({ amount, price: prices[amount] || "" })) });
        if (result.productId) setCreated(result.productId);
        setMessage(result.error || result.warning || "Draft created with its denomination options and GiftPort links.");
      } catch { setMessage("Import could not be confirmed. Retry this page to check the same import reference."); }
    });
  }}>
    <fieldset disabled={pending || !!created} className="space-y-6">
      <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">{item.brandName}</h2><p className="mt-2 text-sm text-slate-600">{item.operatorCode} · {item.country || "India"} · {item.currency} · {item.deliveryType || "Delivery unconfirmed"}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">English title<input name="title" defaultValue={item.brandName.slice(0, 150)} required minLength={2} maxLength={150} className={field} /></label>
          <label className="text-sm font-semibold">Russian title (optional)<input name="titleRu" maxLength={150} className={field} /></label>
          <label className="text-sm font-semibold">Website category<select required value={categoryId} onChange={e => setCategoryId(e.target.value)} className={field}><option value="">Choose a category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="self-end text-sm text-slate-500">Supplier category: {item.category || "Not supplied"}</div>
          <label className="text-sm font-semibold">Description<textarea name="description" rows={4} maxLength={5000} className={field} /></label>
          <label className="text-sm font-semibold">Russian description (optional)<textarea name="descriptionRu" rows={4} maxLength={5000} className={field} /></label>
        </div>
        <details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer font-semibold text-blue-700">Create a website category</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Category name<input value={categoryName} onChange={e => setCategoryName(e.target.value)} maxLength={100} className={field} /></label>
          <label className="text-sm">Category type<select className={field} value={categoryType} onChange={e => setCategoryType(e.target.value)}>{["GIFT_CARD", "SUBSCRIPTION", "GAME_KEY", "GAME_TOPUP", "DIGITAL_PRODUCT"].map(t => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}</select></label>
          <button type="button" className="self-end rounded-xl border border-blue-600 px-4 py-3 font-bold text-blue-700" onClick={() => startTransition(async () => { try { const r = await createSupplierImportCategory(categoryName, categoryType); if (r.category) { setCategories(c => [...c.filter(i => i.id !== r.category!.id), r.category!].sort((a, b) => a.name.localeCompare(b.name))); setCategoryId(r.category.id); setMessage("Category ready."); } else setMessage(r.error || "Unable to create category."); } catch { setMessage("Category creation could not be confirmed. Retry with the same name."); } })}>Save category</button>
        </div></details>
      </section>
      <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Denominations and selling prices</h2><p className="mt-2 text-sm text-slate-600">Select up to 50 options. Face values stay in INR. Calculate USD selling prices using your website rate, or enter them manually.</p>
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-bold">Convert face value and add markup</h3>
          <p className="mt-2 text-sm text-slate-600">USD selling price = face value ÷ website exchange rate × (1 + markup ÷ 100). This is a markup on face value; supplier costs are not provided.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">Markup (%)<input type="number" min="0" max="1000" step="0.01" value={markup} onChange={e => setMarkup(e.target.value)} className="mt-2 block w-36 rounded-lg border border-slate-300 bg-white p-3" /></label>
            <button type="button" disabled={!selected.length || pending} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50" onClick={() => startTransition(async () => {
              try {
                const response = await calculateGiftPortPrices(selected, item.currency || "", markup);
                if (!response.result) { setPricingMessage(response.error || "Unable to calculate prices."); return; }
                setPrices(previous => ({ ...previous, ...response.result.prices }));
                setPricingMessage(`Applied ${response.result.markup}% markup to ${selected.length} selected options at 1 USD = ${response.result.rate} ${response.result.currency}. Prices are rounded to two decimals. You can edit them below.`);
              } catch { setPricingMessage("Unable to calculate prices. Try again or enter them manually."); }
            })}>Apply to selected prices</button>
            <Link href="/admin/payment-settings" target="_blank" rel="noopener noreferrer" className="py-3 text-sm font-semibold text-blue-700 underline">Website exchange rates ↗</Link>
          </div>
          <p className="mt-3 text-xs text-slate-600">Replaces prices for selected options only. Uses the latest saved rate when applied. Imported prices stay fixed until you change them.</p>
          {pricingMessage && <p role="status" className="mt-3 text-sm font-semibold">{pricingMessage}</p>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4"><strong className="text-sm">{selected.length} selected</strong><button type="button" onClick={() => setSelected(amounts.filter(v => Number.isSafeInteger(Number(v))).slice(0, 50))} className="text-sm font-bold text-blue-700">Select up to 50</button><button type="button" onClick={() => setSelected([])} className="text-sm font-bold text-blue-700">Clear selection</button></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Select</th><th className="p-3">Face value INR</th><th className="p-3">Selling price USD</th></tr></thead><tbody>{amounts.map(amount => <tr key={amount} className="border-t"><td className="p-3"><input aria-label={`Import INR ${amount}`} type="checkbox" checked={selected.includes(amount)} disabled={!Number.isSafeInteger(Number(amount)) || (!selected.includes(amount) && selected.length >= 50)} onChange={() => setSelected(s => s.includes(amount) ? s.filter(v => v !== amount) : [...s, amount])} /></td><td className="p-3">{amount}{!Number.isSafeInteger(Number(amount)) && <span className="block text-xs text-amber-800">Website requires whole-number face values</span>}</td><td className="p-3"><input aria-label={`USD selling price for INR ${amount}`} type="number" step="0.01" min="0.01" max="9999999.99" disabled={!selected.includes(amount)} required={selected.includes(amount)} value={prices[amount] || ""} onChange={e => setPrices({ ...prices, [amount]: e.target.value })} className="w-40 rounded-lg border p-2" placeholder="USD price" /></td></tr>)}</tbody></table></div>
        {item.variable === true && item.variableRange && <div className="mt-5 rounded-xl bg-blue-50 p-4"><label className="block text-sm font-semibold">Add a fixed option from the variable range ({item.variableRange.min}–{item.variableRange.max} INR)<input type="number" min={item.variableRange.min} max={item.variableRange.max} step="1" value={custom} onChange={e => setCustom(e.target.value)} className={field} placeholder="Enter INR face value" /></label><button type="button" onClick={addValue} className="mt-3 rounded-lg border border-blue-600 px-4 py-2 font-bold text-blue-700">Add denomination</button></div>}
        {item.denominationsIncomplete && <p className="mt-3 text-sm text-amber-800">The supplier’s fixed-value list needs confirmation. Only values within an explicit variable range can be added.</p>}
      </section>
      <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Imports are drafts with zero stock. GiftPort links are saved for review; importing does not purchase cards, publish the product or enable automatic delivery.</p>
      <button disabled={pending || !selected.length} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Create draft and save supplier links"}</button>
    </fieldset>
    {message && <p role="status" className="rounded-xl border bg-white p-4 text-sm">{message}</p>}
    {created && <div className="flex flex-wrap gap-4"><Link className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white" href={`/admin/products/${created}/edit/supplier?provider=giftport`}>Review GiftPort links</Link><Link className="rounded-xl border px-5 py-3 font-bold" href={`/admin/products/${created}/edit/general`}>Edit draft product</Link></div>}
  </form>;
}
