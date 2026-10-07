"use client";
import { useState } from "react";
import RangeSupplierImport from "./RangeSupplierImport";
import { restrictionCurrencies } from "@/lib/purchase-restriction-currencies";
import { rangePrice, type ProductRange } from "@/lib/product-range";
import { parseRangeMarkup, supplierRangeRate, type RangeMarkup } from "@/lib/range-markup";

export default function RangeOptionEditor({ range, ready, productCurrency = "USD", initialMarkup = null }: {
  range: ProductRange | null; ready: boolean; productCurrency?: string; initialMarkup?: RangeMarkup | null;
}) {
  const [enabled, setEnabled] = useState(range?.enabled ?? false);
  const [mode, setMode] = useState(range?.delivery_mode ?? "MANUAL");
  const [manualOpen, setManualOpen] = useState(!!range && range.delivery_mode === "MANUAL");
  const [currencyChoice, setCurrencyChoice] = useState(range?.currency ?? "PRODUCT");
  const currency = currencyChoice === "PRODUCT" ? productCurrency : currencyChoice;
  const [minimum, setMinimum] = useState(String(range?.minimum ?? 2));
  const [maximum, setMaximum] = useState(String(range?.maximum ?? 500));
  const [step, setStep] = useState(String(range?.step ?? 1));
  const [basis, setBasis] = useState(String(range?.price_basis ?? 100));
  const [price, setPrice] = useState(String(range?.price_usd ?? ""));
  const [supplierReference, setSupplierReference] = useState(range?.supplier_reference ?? "");
  const [supplierName, setSupplierName] = useState("Definite Play");
  const [discount, setDiscount] = useState<number | null>(initialMarkup?.discount ?? null);
  const [markup, setMarkup] = useState(initialMarkup ? String(initialMarkup.markup) : "");
  const [imported, setImported] = useState("");
  const supplier = mode === "SUPPLIER";
  const percentage = supplier && discount !== null;
  const unsupportedCurrency = percentage && currency !== "USD";
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900";
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const sample = Number(minimum) <= 100 && Number(maximum) >= 100 && Number.isInteger((10000 - Math.round(Number(minimum) * 100)) / Math.round(Number(step) * 100)) ? 100 : Number(minimum);
  let example = "—", supplierCost = "—", validMarkup = false;
  try {
    const rate = percentage ? supplierRangeRate(discount!, parseRangeMarkup(markup)) : Number(price);
    validMarkup = percentage;
    if (!unsupportedCurrency) {
      example = money(rangePrice({ product_id: "", option_id: "", enabled: true, currency,
        minimum: Number(minimum), maximum: Number(maximum), step: Number(step),
        price_basis: percentage ? 100 : Number(basis), price_usd: rate,
        price_rounding: percentage ? "UP" : range?.price_rounding, delivery_mode: mode, supplier: null, supplier_reference: null }, sample));
      if (percentage) supplierCost = money(rangePrice({ product_id: "", option_id: "", enabled: true, currency,
        minimum: Number(minimum), maximum: Number(maximum), step: Number(step), price_basis: 100,
        price_usd: supplierRangeRate(discount!, 0), price_rounding: "UP", delivery_mode: mode, supplier: null, supplier_reference: null }, sample));
    }
  } catch { /* An incomplete percentage keeps the preview empty. */ }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black">Custom card value</h2><p className="mt-1 text-sm text-slate-500">Import a supplier range and set your markup.</p></div>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={unsupportedCurrency} />Enable range</label>
    </div>
    {!ready && <p role="status" className="mt-3 text-sm text-amber-800">The range database update must be installed before saving.</p>}
    <RangeSupplierImport onImport={item => {
      setCurrencyChoice(item.currency); setMinimum(item.minimum); setMaximum(item.maximum); setStep(item.increment);
      setSupplierReference(item.sku); setSupplierName(`${item.name} · ${item.region}`); setDiscount(item.discountPercent);
      setMode("SUPPLIER"); setEnabled(false); setManualOpen(false);
      setImported("Range imported. Set your markup, then save.");
    }} />
    {imported && <p role="status" className="mt-3 text-sm font-semibold text-blue-700">{imported}</p>}
    {supplier ? <>
      <input type="hidden" name="currency" value={currency} /><input type="hidden" name="minimum" value={minimum} />
      <input type="hidden" name="maximum" value={maximum} /><input type="hidden" name="step" value={step} />
      <input type="hidden" name="delivery_mode" value="SUPPLIER" /><input type="hidden" name="supplier" value="DEFINITEPLAY" />
      <input type="hidden" name="supplier_reference" value={supplierReference} />
      {!percentage && <><input type="hidden" name="price_basis" value={basis} /><input type="hidden" name="price_usd" value={price} /></>}
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-3">
          <p className="break-words text-sm font-bold">{supplierName}</p>
          <p className="mt-1 text-sm text-slate-600">{minimum}–{maximum} {currency} · Increments of {step}</p>
          <p className="mt-1 break-words text-xs text-slate-500">Supplier delivery · {supplierReference}</p>
        </div>
        <label className="text-sm font-semibold">Markup on supplier cost (%)
          <input className={input} name={percentage ? "markup_percent" : undefined} type="number" inputMode="decimal" min="0" max="1000" step="0.01"
            required={percentage} disabled={!percentage || unsupportedCurrency} placeholder="e.g. 5" value={markup} onChange={e => setMarkup(e.target.value)} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Supplier cost + your percentage</span>
        </label>
      </div>
      {unsupportedCurrency ? <p role="status" className="mt-3 text-sm text-amber-800">USD pricing for {currency} cards needs supplier billing verification before saving percentage pricing.</p>
        : !percentage ? <p className="mt-3 text-sm text-slate-600">Import this supplier range to set its percentage. Your saved price stays in place until you save a new markup.</p>
        : <div className="mt-3 rounded-lg bg-blue-50 px-3 py-3 text-sm" aria-live="polite">
          <span>{sample} {currency} card · Supplier {supplierCost} → Your price </span><strong data-testid="range-selling-price">{example}</strong>
          <p className="mt-1 text-xs text-slate-600">Your markup follows supplier cost updates. Final prices round up to the nearest cent; customer discounts apply separately.</p>
        </div>}
    </> : <>
      <button type="button" onClick={() => setManualOpen(!manualOpen)} className="mt-4 text-sm font-semibold text-slate-600">{manualOpen ? "Hide manual range settings" : "Set up a manual range"}</button>
      {manualOpen && <>
        <input type="hidden" name="delivery_mode" value="MANUAL" /><input type="hidden" name="currency" value={currency} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">Currency<select className={input} value={currencyChoice} onChange={e => { const next = e.target.value; setCurrencyChoice(next); if ((next === "PRODUCT" ? productCurrency : next) !== currency) setPrice(""); }}>
            <option value="PRODUCT">Product currency ({productCurrency})</option>{!restrictionCurrencies.some(c => c.code === currency) && <option value={currency}>{currency}</option>}{restrictionCurrencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select></label>
          <label className="text-sm font-semibold">Minimum value<input name="minimum" className={input} type="number" min="0.01" step="0.01" required value={minimum} onChange={e => setMinimum(e.target.value)} /></label>
          <label className="text-sm font-semibold">Maximum value<input name="maximum" className={input} type="number" min="0.01" step="0.01" required value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
          <label className="text-sm font-semibold">Price for {basis} {currency} (USD)<input name="price_usd" className={input} type="number" min="0.01" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} /></label>
        </div>
        <p className="mt-3 text-sm text-slate-600">Example: a {sample} {currency} card costs <strong>{example}</strong>.</p>
        <details className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Manual pricing details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Allowed increments<input name="step" className={input} type="number" min="0.01" step="0.01" required value={step} onChange={e => setStep(e.target.value)} /></label>
            <label className="text-sm">Amount used for pricing ({currency})<input name="price_basis" className={input} type="number" min="1" step="1" required value={basis} onChange={e => setBasis(e.target.value)} /></label>
          </div>
        </details>
      </>}
    </>}
    {(supplier || manualOpen) && <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">{supplier ? "Supplier codes are delivered after confirmed payment." : "Your team delivers these codes after payment."}</p>
      <button disabled={!ready || unsupportedCurrency || (percentage && !validMarkup)} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Save range</button>
    </div>}
  </section>;
}
