"use client";
import {useState} from "react";
import {restrictionCurrencies} from "@/lib/purchase-restriction-currencies";
import {rangePrice,type ProductRange} from "@/lib/product-range";
export default function RangeOptionEditor({range,ready,productCurrency="USD"}:{range:ProductRange|null;ready:boolean;productCurrency?:string}){
 const [enabled,setEnabled]=useState(range?.enabled??false),[mode,setMode]=useState(range?.delivery_mode??"MANUAL");
 const [currencyChoice,setCurrencyChoice]=useState(range?.currency??"PRODUCT");
 const currency=currencyChoice==="PRODUCT"?productCurrency:currencyChoice;
 const [minimum,setMinimum]=useState(String(range?.minimum??2)),[maximum,setMaximum]=useState(String(range?.maximum??500));
 const [basis,setBasis]=useState(String(range?.price_basis??100)),[price,setPrice]=useState(String(range?.price_usd??"")),[step,setStep]=useState(String(range?.step??1));
 const input="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900";
 let example="—";
 try{example=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(rangePrice({product_id:"",option_id:"",enabled:true,currency,minimum:Number(minimum),maximum:Number(maximum),step:Number(step),price_basis:Number(basis),price_usd:Number(price),delivery_mode:"MANUAL",supplier:null,supplier_reference:null},Number(minimum)));}catch{}
 return <section className="rounded-2xl border border-slate-200 bg-white p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Custom card value</h2><p className="mt-1 text-sm text-slate-500">Customers enter an amount, choose quantity, and add to their order.</p></div><label className="flex items-center gap-2 font-bold"><input type="checkbox" name="enabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable range</label></div>
  {!ready&&<p role="status" className="mt-3 text-sm text-amber-800">The range database update must be installed before saving.</p>}
  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
   <label className="text-sm font-semibold">Currency<select className={input} value={currencyChoice} onChange={e=>{const next=e.target.value;setCurrencyChoice(next);if((next==="PRODUCT"?productCurrency:next)!==currency)setPrice("");}}><option value="PRODUCT">Use product currency ({productCurrency})</option>{!restrictionCurrencies.some(c=>c.code===currency)&&<option value={currency}>{currency}</option>}{restrictionCurrencies.map(c=><option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select><input type="hidden" name="currency" value={currency}/></label>
   <label className="text-sm font-semibold">Minimum value<input name="minimum" className={input} type="number" min="0.01" step="0.01" required value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
   <label className="text-sm font-semibold">Maximum value<input name="maximum" className={input} type="number" min="0.01" step="0.01" required value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>
   <label className="text-sm font-semibold">Price for {basis} {currency} (USD)<input name="price_usd" className={input} type="number" min="0.01" step="0.01" required placeholder="Enter selling price" value={price} onChange={e=>setPrice(e.target.value)}/></label>
  </div>
  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Example: a {minimum||"—"} {currency} card costs <strong className="text-slate-900">{example}</strong>. Assigned customer discounts apply separately.</p>
  <details className="mt-4 border-t border-slate-100 pt-3">
   <summary className="cursor-pointer text-sm font-semibold text-slate-600">Advanced settings</summary>
   <div className="mt-3 grid gap-4 sm:grid-cols-3">
    <label className="text-sm">Allowed increments<input name="step" className={input} type="number" min="0.01" step="0.01" value={step} onChange={e=>setStep(e.target.value)} required/><span className="text-xs text-slate-500">Use 1 to allow every whole amount.</span></label>
    <label className="text-sm">Amount used for pricing ({currency})<input name="price_basis" className={input} type="number" min="1" step="1" value={basis} onChange={e=>setBasis(e.target.value)} required/></label>
    <label className="text-sm">Delivery<select name="delivery_mode" className={input} value={mode} onChange={e=>setMode(e.target.value as "MANUAL"|"SUPPLIER")}><option value="MANUAL">Manual code delivery</option><option value="SUPPLIER">Supplier delivery — setup required</option></select></label>
   </div>
   {mode==="SUPPLIER"&&<div className="mt-3 grid gap-3 sm:grid-cols-2"><label>Supplier<select className={input} name="supplier" defaultValue={range?.supplier??"DEFINITEPLAY"}><option value="DEFINITEPLAY">Definite Play</option><option value="GIFTPORT">GiftPort</option></select></label><label>Supplier product code<input className={input} name="supplier_reference" defaultValue={range?.supplier_reference??""}/></label><p className="text-sm text-amber-800 sm:col-span-2">Automatic range delivery is not connected yet. Supplier configurations can only be saved with the range disabled.</p></div>}
  </details>
  <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{mode==="MANUAL"?"Your team delivers these codes after payment.":"Supplier setup is pending."}</p><button disabled={!ready} className="rounded-lg bg-blue-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">Save range</button></div>
 </section>;
}
