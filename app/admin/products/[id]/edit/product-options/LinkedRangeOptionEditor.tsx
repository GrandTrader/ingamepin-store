"use client";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import RangeSupplierImport from "./RangeSupplierImport";
import { restrictionCurrencies } from "@/lib/purchase-restriction-currencies";
import { rangePrice, type ProductRange } from "@/lib/product-range";
import { parseRangeMarkup, supplierRangeRate, type RangeMarkup } from "@/lib/range-markup";
import { linkedDenominationPrice, linkedSupplierPrice, markedUpRate, type LinkedRangePricing, type RangePriceOption } from "@/lib/linked-range-pricing";
import type { ManualCodeRangeDefaults } from "@/lib/manual-code-range";

export default function LinkedRangeOptionEditor({ range, ready, productCurrency = "USD", initialMarkup = null, manualDefaults = null,
  options, linkedPricing, supplierFixedPricing = false }: {
  range: ProductRange | null; ready: boolean; productCurrency?: string; initialMarkup?: RangeMarkup | null;
  manualDefaults?: ManualCodeRangeDefaults | null; options: RangePriceOption[]; linkedPricing: LinkedRangePricing;
  supplierFixedPricing?: boolean;
}) {
  const uid = useId();
  const { pending } = useFormStatus();
  const [enabled, setEnabled] = useState(range?.enabled ?? false);
  const [mode, setMode] = useState(range?.delivery_mode ?? "MANUAL");
  const [currencyChoice, setCurrencyChoice] = useState(range?.currency ?? manualDefaults?.currency ?? "PRODUCT");
  const currency = currencyChoice === "PRODUCT" ? productCurrency : currencyChoice;
  const [minimum, setMinimum] = useState(String(range?.minimum ?? manualDefaults?.minimum ?? 2));
  const [maximum, setMaximum] = useState(String(range?.maximum ?? manualDefaults?.maximum ?? 500));
  const [step, setStep] = useState(String(range?.step ?? manualDefaults?.step ?? 1));
  const [basis, setBasis] = useState(String(range?.price_basis ?? manualDefaults?.price_basis ?? 100));
  const [base, setBase] = useState(String(linkedPricing.manualBasePrice ?? range?.price_usd ?? manualDefaults?.price_usd ?? ""));
  const [supplierReference, setSupplierReference] = useState(range?.supplier_reference ?? "");
  const [supplierName, setSupplierName] = useState("Definite Play");
  const [discount, setDiscount] = useState<number | null>(initialMarkup?.discount ?? null);
  const [markup, setMarkup] = useState(String(initialMarkup?.markup ?? linkedPricing.manualMarkup ?? 0));
  const [sample, setSample] = useState(String(range?.minimum ?? manualDefaults?.minimum ?? 2));
  const [expanded, setExpanded] = useState(false);
  const [imported, setImported] = useState("");
  const supplier = mode === "SUPPLIER";
  const percentage = supplier && discount !== null;
  const unsupportedCurrency = supplier && currency !== "USD";
  const input = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900";
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  let rate = 0, percent = 0, valid = false, example = "—";
  try {
    percent = parseRangeMarkup(markup);
    rate = percentage ? supplierRangeRate(discount!, percent) : markedUpRate(Number(base), percent);
    valid = rate > 0 && rate <= 1000000 && (!supplier || percentage) && !unsupportedCurrency;
    if (valid) example = money(rangePrice({ product_id: "", option_id: "", enabled: true, currency,
      minimum: Number(minimum), maximum: Number(maximum), step: Number(step), price_basis: percentage ? 100 : Number(basis),
      price_usd: rate, price_rounding: "UP", delivery_mode: mode, supplier: null, supplier_reference: null }, Number(sample)));
  } catch { /* Incomplete inputs have no preview and cannot be saved. */ }
  const mismatched = options.some(option => option.currency !== currency);
  function fixedPrice(option: RangePriceOption) {
    if (!valid || option.currency !== currency) return "—";
    try {
      if (supplier && supplierFixedPricing) return option.supplierCost ? money(linkedSupplierPrice(option.supplierCost, percent)) : "Cost pending";
      return money(linkedDenominationPrice(option.denomination, percentage ? 100 : Number(basis), rate));
    } catch { return "—"; }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Range and denomination pricing">
    <input type="hidden" name="link_fixed_prices" value="on" />
    <input type="hidden" name="currency" value={currency} /><input type="hidden" name="delivery_mode" value={mode} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black">Product pricing</h2><p className="mt-1 text-sm text-slate-500">One markup for your custom range and fixed denominations.</p></div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={unsupportedCurrency} />Enable custom range</label>
    </div>
    {!ready && <p role="status" className="mt-3 text-sm text-amber-800">Install the linked pricing database update before saving.</p>}
    {range && ready && !linkedPricing.linked && <p className="mt-3 text-xs text-slate-600">Review the new prices below, then save once to link this product.</p>}
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Shared markup</h3><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">Range + {options.length} denominations</span></div>
      <div className="mt-3 grid items-end gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <label className="text-sm font-semibold" htmlFor={`${uid}-markup`}>{supplier ? "Markup on supplier cost (%)" : "Markup on base price (%)"}
          <input id={`${uid}-markup`} className={input} name="markup_percent" type="number" inputMode="decimal" min="0" max="1000" step="0.01" required disabled={supplier && (!percentage || unsupportedCurrency)} value={markup} onChange={e => setMarkup(e.target.value)} />
        </label>
        <p className="text-xs text-slate-600">{supplier ? "Each supplier item uses this markup on its own cost. Prices follow supplier cost updates." : "Change this percentage to update both prices. Your saved base price stays fixed."}</p>
      </div>
    </div>
    {mismatched && <p role="alert" className="mt-3 text-sm text-red-700">All active denominations must use {currency} before linking their prices.</p>}
    {unsupportedCurrency && <p role="status" className="mt-3 text-sm text-amber-800">Supplier billing for this currency must be verified before enabling shared markup.</p>}
    {supplier && !percentage && <p className="mt-3 text-sm text-amber-800">Import the supplier range below to load its cost and set your markup.</p>}
    <div className="mt-5 flex items-center justify-between gap-2"><h3 className="font-bold">Price preview</h3><span className="text-xs text-slate-500">Selling prices in USD</span></div>
    <div className="mt-3 grid items-center gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
      <div><p className="text-sm font-bold">Custom card value</p><p className="mt-1 text-xs text-slate-500">{minimum}–{maximum} {currency} · Step {step}</p></div>
      <label className="text-xs font-bold">Card value ({currency})<input className={input} type="number" inputMode="decimal" min={minimum} max={maximum} step={step} value={sample} onChange={e => setSample(e.target.value)} /></label>
      <div className="text-right"><span className="block text-xs text-slate-500">Your selling price</span><strong className="text-xl tabular-nums" data-testid="range-selling-price" aria-live="polite">{example}</strong></div>
    </div>
    {options.length > 0 && <>
      <table className="mt-3 w-full table-fixed text-sm" aria-label="Linked denomination price preview">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-2 py-2 text-left font-semibold">Denomination</th><th className="px-2 py-2 text-right font-semibold">Current price</th><th className="px-2 py-2 text-right font-semibold">New price</th></tr></thead>
        <tbody>{(expanded ? options : options.slice(0, 6)).map(option => <tr key={option.id} className="border-b border-slate-100"><td className="break-words px-2 py-3">{option.denomination} {option.currency}</td><td className="px-2 py-3 text-right tabular-nums text-slate-500">{money(option.sellingPrice)}</td><td className="px-2 py-3 text-right font-bold tabular-nums">{fixedPrice(option)}</td></tr>)}</tbody>
      </table>
      {options.length > 6 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-11 py-2 text-sm font-semibold text-blue-600">{expanded ? "Show fewer denominations" : `Show all ${options.length} denominations`}</button>}
      {supplier && supplierFixedPricing && options.some(o => !o.supplierCost) && <p className="mt-2 text-xs text-amber-800">Items awaiting supplier costs keep their last price and receive this markup when costs refresh.</p>}
    </>}
    <p className="mt-3 text-xs text-slate-500">Prices round up to the nearest cent. Customer discounts apply separately.</p>
    <details className="mt-4 border-t border-slate-200 pt-3" open={!range && !manualDefaults}>
      <summary className="cursor-pointer py-2 text-sm font-semibold text-slate-600">Range and base price settings</summary>
      {supplier ? <>
        <input type="hidden" name="minimum" value={minimum} /><input type="hidden" name="maximum" value={maximum} /><input type="hidden" name="step" value={step} />
        <input type="hidden" name="supplier" value="DEFINITEPLAY" /><input type="hidden" name="supplier_reference" value={supplierReference} />
        <p className="mt-2 break-words text-sm text-slate-600">{supplierName} · {supplierReference}</p>
      </> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-semibold">Currency<select className={input} value={currencyChoice} onChange={e => { setCurrencyChoice(e.target.value); setBase(""); }}><option value="PRODUCT">Product currency ({productCurrency})</option>{!restrictionCurrencies.some(c => c.code === currency) && <option value={currency}>{currency}</option>}{restrictionCurrencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Minimum value<input name="minimum" className={input} type="number" min="0.01" step="0.01" required value={minimum} onChange={e => setMinimum(e.target.value)} /></label>
        <label className="text-sm font-semibold">Maximum value<input name="maximum" className={input} type="number" min="0.01" step="0.01" required value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
        <label className="text-sm font-semibold">Allowed increments<input name="step" className={input} type="number" min="0.01" step="0.01" required value={step} onChange={e => setStep(e.target.value)} /></label>
        <label className="text-sm font-semibold">Pricing basis ({currency})<input name="price_basis" className={input} type="number" min="1" step="1" required value={basis} onChange={e => setBasis(e.target.value)} /></label>
        <label className="text-sm font-semibold">Base price for {basis} {currency} (USD)<input name="base_price_usd" className={input} type="number" min="0.0000000001" max="1000000" step="any" required value={base} onChange={e => setBase(e.target.value)} /></label>
      </div>}
      <RangeSupplierImport onImport={item => {
        setCurrencyChoice(item.currency); setMinimum(item.minimum); setMaximum(item.maximum); setStep(item.increment); setSample(item.minimum);
        setSupplierReference(item.sku); setSupplierName(`${item.name} · ${item.region}`); setDiscount(item.discountPercent);
        setMode("SUPPLIER"); setEnabled(false); setImported("Range imported. Review the shared markup, then save all prices.");
      }} />
      {imported && <p role="status" className="mt-3 text-sm font-semibold text-blue-700">{imported}</p>}
    </details>
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">{supplier ? "Custom values use supplier delivery." : "Custom values use manual delivery."} Fixed denominations keep their delivery method.</p>
      <button disabled={pending || !ready || !valid || mismatched} className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving all prices…" : "Save all prices"}</button>
    </div>
  </section>;
}
