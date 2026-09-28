"use client";
import {useState} from "react";
import type {ProductRange} from "@/lib/product-range";
export default function RangeOptionEditor({range,ready}:{range:ProductRange|null;ready:boolean}){
 const [enabled,setEnabled]=useState(range?.enabled??false),[mode,setMode]=useState(range?.delivery_mode??"MANUAL");
 const [currency,setCurrency]=useState(range?.currency??"USD"),[minimum,setMinimum]=useState(String(range?.minimum??2)),[maximum,setMaximum]=useState(String(range?.maximum??500));
 const input="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
 return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
  <h2 className="text-lg font-black">Range denomination</h2><p className="mt-1 text-sm text-slate-600">Let customers enter a denomination and quantity. Fixed options remain available.</p>
  {!ready&&<p role="status" className="mt-3 text-sm text-amber-800">The range database update must be installed before saving.</p>}
  <label className="my-4 flex items-center gap-3 font-bold"><input type="checkbox" name="enabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable range purchasing for this product</label>
  <div className="mb-4 flex flex-wrap gap-2"><button type="button" className="rounded border bg-white px-3 py-2 text-sm" onClick={()=>{setCurrency("INR");setMinimum("100");setMaximum("10000");}}>Apple India: ₹100–₹10,000</button><button type="button" className="rounded border bg-white px-3 py-2 text-sm" onClick={()=>{setCurrency("USD");setMinimum("2");setMaximum("500");}}>Apple USA: $2–$500</button></div>
  <div className="grid gap-4 sm:grid-cols-3">
   <label>Denomination currency<input name="currency" className={input} required pattern="[A-Za-z]{3}" maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
   <label>Minimum denomination<input name="minimum" className={input} type="number" min="0.01" step="0.01" required value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
   <label>Maximum denomination<input name="maximum" className={input} type="number" min="0.01" step="0.01" required value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>
   <label>Denomination step<input name="step" className={input} type="number" min="0.01" step="0.01" defaultValue={range?.step??1} required/></label>
   <label>Pricing basis ({currency})<input name="price_basis" className={input} type="number" min="1" step="1" defaultValue={range?.price_basis??100} required/></label>
   <label>Selling price for the basis (USD)<input name="price_usd" className={input} type="number" min="0.01" step="0.01" defaultValue={range?.price_usd??""} required/></label>
  </div>
  <p className="mt-2 text-xs text-slate-600">Price per code = entered denomination ÷ pricing basis × USD selling price. Customer discounts apply at checkout.</p>
  <label className="mt-4 block">Range delivery<select name="delivery_mode" className={input} value={mode} onChange={e=>setMode(e.target.value as "MANUAL"|"SUPPLIER")}><option value="MANUAL">Admin delivers codes manually</option><option value="SUPPLIER">Automatic supplier delivery</option></select></label>
  {mode==="SUPPLIER"&&<div className="mt-3 grid gap-3 sm:grid-cols-2"><label>Supplier<select className={input} name="supplier" defaultValue={range?.supplier??"DEFINITEPLAY"}><option value="DEFINITEPLAY">Definite Play</option><option value="GIFTPORT">GiftPort</option></select></label><label>Variable-value SKU / operator code<input className={input} name="supplier_reference" defaultValue={range?.supplier_reference??""}/></label><p className="text-sm text-amber-800 sm:col-span-2">Supplier range activation requires a verified variable-value API connection. You can save this configuration with range purchasing switched off.</p></div>}
  <button disabled={!ready} className="mt-4 rounded-lg bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">Save range settings</button>
 </section>;
}
