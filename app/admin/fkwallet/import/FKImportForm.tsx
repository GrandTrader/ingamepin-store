"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fkCustomerFields, fkPlainText, fkSellingPrice } from "@/lib/fkwallet-import";
import type { FKProduct } from "@/lib/fkwallet-types";
import { importFKProduct } from "./actions";

const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal";
const box = "rounded-xl border border-slate-200 bg-white p-5";
type Props = { items: FKProduct[]; categories: { id: string; name: string }[]; requestId: string; connectionId: string; supplierCategoryId: number; databaseReady: boolean };

export default function FKImportForm({ items, categories, requestId, connectionId, supplierCategoryId, databaseReady }: Props) {
  const [selected, setSelected] = useState(items.map(item => item.id));
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState(items[0].name.slice(0, 150));
  const [titleRu, setTitleRu] = useState((items[0].nameRu ?? "").slice(0, 150));
  const [description, setDescription] = useState(fkPlainText(items[0].description + "\n\n" + items[0].help).slice(0, 5000));
  const [descriptionRu, setDescriptionRu] = useState(fkPlainText((items[0].descriptionRu ?? "") + "\n\n" + (items[0].helpRu ?? "")).slice(0, 5000));
  const [region, setRegion] = useState("");
  const [markup, setMarkup] = useState("");
  const [rate, setRate] = useState(items[0].currency === "USD" ? "1" : "");
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [names, setNames] = useState(Object.fromEntries(items.map(item => [item.id, item.name.slice(0, 150)])));
  const [values, setValues] = useState<Record<number, string>>(Object.fromEntries(items.map(item => [item.id, "1"])));
  const [currencies, setCurrencies] = useState<Record<number, string>>(Object.fromEntries(items.map(item => [item.id, "USD"])));
  const [types, setTypes] = useState<Record<number, "OTHER" | "CURRENCY">>(Object.fromEntries(items.map(item => [item.id, "OTHER"])));
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [result, setResult] = useState<{ productId: string; replayed?: boolean } | null>(null);
  const submitting = useRef(false), completed = useRef<HTMLElement>(null);
  useEffect(() => { if (result) { completed.current?.focus({ preventScroll: true }); completed.current?.scrollIntoView({ block: "start" }); } }, [result]);
  const suggestion = (item: FKProduct) => { try { return fkSellingPrice(String(item.price), rate, markup); } catch { return ""; } };
  const customerFields = fkCustomerFields(items[0]);
  let pricingError = "";
  if (rate && markup) { try { items.filter(p => selected.includes(p.id)).forEach(p => fkSellingPrice(String(p.price), rate, markup)); } catch (error) { pricingError = error instanceof Error ? error.message : "Check pricing."; } }
  async function save() {
    if (submitting.current || result || !databaseReady) return;
    submitting.current = true; setPending(true); setMessage("");
    try {
      const response = await importFKProduct({ requestId, connectionId, supplierCategoryId, categoryId, title, titleRu, description, descriptionRu, region, markup, exchangeRate: rate,
        options: items.filter(item => selected.includes(item.id)).map(item => ({ id: item.id, expectedCost: String(item.price), expectedCurrency: item.currency,
          name: names[item.id], denomination: values[item.id], currency: currencies[item.id], optionType: types[item.id], price: prices[item.id] })) });
      if (response.productId) setResult({ productId: response.productId, replayed: response.replayed });
      else setMessage(response.error ?? "The draft could not be confirmed. Retry on this page.");
    } catch { setMessage("The response was interrupted. Retry on this page to check the same draft."); }
    finally { submitting.current = false; setPending(false); }
  }
  if (result) return <section ref={completed} tabIndex={-1} className={`${box} mt-6 scroll-mt-32`} aria-label="Draft created">
    <h2 className="text-xl font-bold">{result.replayed ? "Draft already saved" : "Draft created"}</h2>
    <p className="mt-3 text-slate-600">Your prices and FKWallet links are saved. Review the product details and add its image. It has zero stock; automatic customer delivery is not enabled.</p>
    <Link className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-bold text-white" href={`/admin/products/${result.productId}/edit/general`}>Review draft</Link>
  </section>;
  return <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
    {!databaseReady && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">Preview is available. Install the FKWallet {customerFields.length ? "customer fields" : "import"} database update before saving a draft.</p>}
    <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Import creates a draft with zero stock and saves its supplier links. No supplier purchase is made. Customer delivery must be set up separately.</p>
    <fieldset disabled={pending} className="min-w-0 space-y-5 disabled:opacity-60">
      {!!customerFields.length && <section className={box} aria-label="Customer information for delivery">
        <h2 className="text-lg font-bold">Customer information for delivery</h2>
        <p className="mt-2 text-sm text-slate-600">These required fields will be added to the product. Customers enter their details when ordering.</p>
        <ul className="mt-3 space-y-2 text-sm">{customerFields.map(field => <li key={field.key}><strong>{field.label}</strong>{field.placeholder && <span className="text-slate-500"> · Example: {field.placeholder}</span>}</li>)}</ul>
      </section>}
      <section className={`${box} grid gap-4 sm:grid-cols-2`}>
        <label className="text-sm font-bold sm:col-span-2">Website category<select required className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Choose category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="text-sm font-bold">Product title (English)<input required minLength={2} maxLength={150} className={input} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="text-sm font-bold">Product title (Russian, optional)<input maxLength={150} className={input} value={titleRu} onChange={e => setTitleRu(e.target.value)} /></label>
        <label className="text-sm font-bold">Description (English)<textarea aria-label="Description (English)" rows={4} maxLength={5000} className={input} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="text-sm font-bold">Description (Russian, optional)<textarea aria-label="Description (Russian, optional)" rows={4} maxLength={5000} className={input} value={descriptionRu} onChange={e => setDescriptionRu(e.target.value)} /></label>
        <label className="text-sm font-bold">Region<input required maxLength={100} placeholder="For example: India, Russia or Global" className={input} value={region} onChange={e => setRegion(e.target.value)} /></label>
      </section>
      <section className={box}>
        <h2 className="text-lg font-bold">Set your selling prices</h2>
        <p className="mt-2 text-sm text-slate-600">Selling price = supplier cost ÷ exchange rate × (1 + markup ÷ 100). Prices are saved in USD.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">Markup (%)<input required type="number" min="0" max="1000" step="0.01" placeholder="Enter your markup" className={input} value={markup} onChange={e => setMarkup(e.target.value)} /></label>
          <label className="text-sm font-bold">1 USD = how many {items[0].currency}?<input required type="number" readOnly={items[0].currency === "USD"} min="0.00000001" max="100000000" step="0.00000001" placeholder="Enter your exchange rate" className={input} value={rate} onChange={e => setRate(e.target.value)} /></label>
        </div>
        <p className="mt-3 text-xs text-slate-500">You can override each selling price below. Manual prices stay fixed when markup changes.</p>
        <button type="button" onClick={() => setPrices({})} className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">Apply markup to all prices</button>
        {pricingError && <p role="alert" className="mt-3 text-sm text-red-700">{pricingError}</p>}
      </section>
      <section className={box}>
        <div className="flex flex-wrap items-center gap-4 text-sm"><h2 className="font-bold">{selected.length} denominations selected</h2><button type="button" className="text-blue-700" onClick={() => setSelected(items.map(item => item.id))}>Select all</button><button type="button" className="text-blue-700" onClick={() => setSelected([])}>Clear selection</button></div>
        <p className="mt-3 text-xs text-slate-500">Choose “Card value” to enter the actual denomination and its currency. For editions or plans, keep “Named option”; the name identifies what the customer receives. Import only matching regions and product families together.</p>
        <div className="mt-4 space-y-4">{items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-4">
          <label className="flex gap-3 text-sm font-bold"><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} /><span className="min-w-0 break-words">{item.name}<span className="mt-1 block text-xs font-normal text-slate-500">FKWallet #{item.id} · Supplier cost: {item.price} {item.currency}</span></span></label>
          <fieldset disabled={!selected.includes(item.id)} className="mt-3 grid min-w-0 gap-3 disabled:opacity-50 sm:grid-cols-2">
            <label className="text-xs font-bold">Option name<input required maxLength={150} className={input} value={names[item.id]} onChange={e => setNames({ ...names, [item.id]: e.target.value })} /></label>
            <label className="text-xs font-bold">Selling price (USD)<input aria-label={`Selling price for ${item.name}`} required type="number" min="0.01" max="9999999.99" step="0.01" className={input} value={prices[item.id] ?? suggestion(item)} onChange={e => setPrices({ ...prices, [item.id]: e.target.value })} />{prices[item.id] !== undefined && <span className="mt-1 block text-blue-700">Manual price</span>}</label>
            <label className="text-xs font-bold">Option type<select aria-label="Option type" className={input} value={types[item.id]} onChange={e => setTypes({ ...types, [item.id]: e.target.value as "CURRENCY" | "OTHER" })}><option value="OTHER">Named option / edition</option><option value="CURRENCY">Card value</option></select></label>
            {types[item.id] === "CURRENCY" && <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Card value<input required type="number" min="0.0001" max="1000000000" step="0.0001" className={input} value={values[item.id]} onChange={e => setValues({ ...values, [item.id]: e.target.value })} /></label><label className="text-xs font-bold">Card currency<input required pattern="[A-Z]{3}" maxLength={3} className={input} value={currencies[item.id]} onChange={e => setCurrencies({ ...currencies, [item.id]: e.target.value.toUpperCase() })} /></label></div>}
          </fieldset>
        </article>)}</div>
      </section>
      <button disabled={!databaseReady || !selected.length || !categories.length || !!pricingError || !rate || !markup} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-40">{pending ? "Creating draft…" : "Create draft product"}</button>
    </fieldset>
    {message && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
  </form>;
}
