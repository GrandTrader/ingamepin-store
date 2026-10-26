"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUPPLIERS, isSupplier, type SupplierChoice, type SupplierSelection, type SupplierSetup, type SupplierPreview } from "@/lib/supplier-switch";
import { loadSupplierSwitch, loadSupplierCatalogFilters, searchSupplierDenominations, previewSupplierSwitch, applySupplierSwitch } from "./switch-actions";

const inputClass="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
export default function SupplierSwitchPanel({productId,currentSupplier}:{productId:string;currentSupplier:string}) {
 const router=useRouter();
 const [setup,setSetup]=useState<SupplierSetup|null>(null),[selection,setSelection]=useState<SupplierSelection|null>(null);
 const [open,setOpen]=useState(false),[pending,startTransition]=useTransition(),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [items,setItems]=useState<SupplierChoice[]>([]),[categories,setCategories]=useState<{id:string;name:string}[]>([]),[regions,setRegions]=useState<string[]>([]);
 const [page,setPage]=useState(1),[total,setTotal]=useState(0),[searched,setSearched]=useState(false);
 const [preview,setPreview]=useState<SupplierPreview|null>(null),[requestId,setRequestId]=useState("");
 const [filterLoading,setFilterLoading]=useState(false),[filterError,setFilterError]=useState(""),[filterAttempt,setFilterAttempt]=useState(0);
 const filterProvider=selection?.provider;
 useEffect(()=>{
  if(!open||!filterProvider)return;
  let active=true;
  setCategories([]);setRegions([]);setFilterError("");setFilterLoading(true);
  loadSupplierCatalogFilters(filterProvider).then(result=>{
   if(!active)return;
   if(result.data){setCategories(result.data.categories);setRegions(result.data.regions);}
   else setFilterError(result.error||"Supplier filters could not be loaded.");
  }).catch(()=>{if(active)setFilterError("Supplier filters could not be loaded. Try again.");})
    .finally(()=>{if(active)setFilterLoading(false);});
  return ()=>{active=false;};
 },[open,filterProvider,filterAttempt]);
 function filter(next:SupplierSelection){edit(next);setItems([]);setTotal(0);setPage(1);setSearched(false);}
 function edit(next:SupplierSelection){setSelection(next);setPreview(null);setError("");setNotice("");}
 function load(){setOpen(true);setError("");setItems([]);setSearched(false);setPage(1);startTransition(async()=>{
  try{const r=await loadSupplierSwitch(productId);if(!r.data){setError(r.error||"Unable to load supplier setup.");return;}
   setSetup(r.data);setSelection(r.data.selection||{provider:isSupplier(r.data.provider)?r.data.provider:"WUPEX",query:"",category:"",region:"",markup:r.data.markup,exchangeRate:r.data.exchangeRate,deliveryKind:"CODE",options:[]});setPreview(null);
  }catch{setError("Supplier settings could not be loaded. Try again.");}
 });}
 function search(nextPage=1){if(!selection)return;setError("");startTransition(async()=>{
  try{const r=await searchSupplierDenominations(selection.provider,selection.query,selection.category,selection.region,nextPage);
   if(!r.data){setError(r.error||"Unable to load catalogue.");return;}setItems(r.data.items);setTotal(r.data.total);setPage(nextPage);setSearched(true);
  }catch{setError("Catalogue could not be loaded. Try again.");}
 });}
 function toggle(item:SupplierChoice){if(!selection||!setup)return;
  const exists=selection.options.some(o=>o.key===item.key);
  if(!exists&&selection.options.length>=50){setError("Select up to 50 denominations.");return;}
  // Only match identical named denominations automatically; other mappings are reviewed explicitly.
  const matches=setup.options.filter(o=>o.name===item.name&&Number(o.denomination)===Number(item.denomination)&&o.currency===item.currency&&!selection.options.some(s=>s.optionId===o.id));
  edit({...selection,deliveryKind:selection.options.length?selection.deliveryKind:item.kind,options:exists?selection.options.filter(o=>o.key!==item.key):[...selection.options,{key:item.key,optionId:matches.length===1?matches[0].id:null,name:item.name,denomination:item.denomination,currency:item.currency}]});
 }
 function review(){if(!selection)return;setError("");startTransition(async()=>{
  try{const r=await previewSupplierSwitch(productId,selection);if(!r.data){setError(r.error||"Unable to preview.");return;}setPreview(r.data);setRequestId(crypto.randomUUID());}
  catch{setError("Preview could not be loaded. Try again.");}
 });}
 function save(){if(!preview)return;setError("");startTransition(async()=>{
  try{const r=await applySupplierSwitch(productId,requestId,preview);if(!r.success){setError(r.error||"Could not save supplier setup.");return;}
   setNotice(r.message||"Supplier and denominations saved.");setPreview(null);const current=await loadSupplierSwitch(productId);if(current.data){setSetup(current.data);setSelection(current.data.selection);}router.refresh();
  }catch{setError("Could not confirm the save. Retry this same preview to check its result.");}
 });}
 return <section className="mt-6 min-w-0 rounded-2xl border border-blue-200 bg-white p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Supplier & denominations</h2><p className="mt-1 text-sm text-slate-600">Current supplier: <strong>{isSupplier(currentSupplier)?SUPPLIERS[currentSupplier]:"Uploaded stock"}</strong></p></div>
   <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={load} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Change supplier</button><button type="button" disabled={pending} onClick={load} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-700 disabled:opacity-50">Sync denominations</button>{open&&<button type="button" disabled={pending} onClick={()=>setOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button>}</div></div>
  {open&&selection&&setup&&<div className="mt-4 space-y-4">
   <p className="text-sm text-slate-600">Select the denominations this product should offer. Only the selected supplier’s options will remain visible. Previous orders are kept.</p>
   <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-3">
    <label className="text-sm font-semibold">Supplier<select aria-label="Supplier" className={inputClass} value={selection.provider} onChange={e=>{const provider=e.target.value;if(!isSupplier(provider))return;filter({...selection,provider,query:"",category:"",region:"",exchangeRate:provider==="FKWALLET"?selection.exchangeRate:"1",options:[],deliveryKind:"CODE"});setItems([]);setCategories([]);setRegions([]);setSearched(false);}}>{Object.entries(SUPPLIERS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="text-sm font-semibold">Markup (%)<input aria-label="Supplier markup" className={inputClass} inputMode="decimal" value={selection.markup} onChange={e=>edit({...selection,markup:e.target.value})} placeholder="Enter markup"/><span className="text-xs font-normal text-slate-500">Supplier cost + this percentage</span></label>
    <label className="text-sm font-semibold">Delivery<select className={inputClass} aria-label="Supplier delivery" value={selection.deliveryKind} onChange={e=>edit({...selection,deliveryKind:e.target.value as "CODE"|"ACCOUNT"})}><option value="CODE">Voucher codes</option>{selection.provider!=="DEFINITEPLAY"&&<option value="ACCOUNT">Account top-up</option>}</select></label>
    {selection.provider==="FKWALLET"&&<label className="text-sm font-semibold">Supplier currency units per USD<input className={inputClass} inputMode="decimal" value={selection.exchangeRate} onChange={e=>edit({...selection,exchangeRate:e.target.value})}/></label>}
   </fieldset>
   <fieldset disabled={pending} className="rounded-xl bg-slate-50 p-3">
    <div className={"grid min-w-0 gap-2 "+(selection.provider==="FKWALLET"?"sm:grid-cols-2":"sm:grid-cols-3")}>
     <label className="min-w-0 text-sm">Search supplier products<input aria-label="Search supplier products" className={inputClass} value={selection.query} onChange={e=>filter({...selection,query:e.target.value})} placeholder="For example: PUBG"/></label>
     <label className="min-w-0 text-sm">Product category<select aria-label="Supplier category" className={inputClass} value={selection.category} disabled={filterLoading||!!filterError} onChange={e=>filter({...selection,category:e.target.value,options:selection.provider==="FKWALLET"?[]:selection.options})}>
      <option value="">{filterLoading?"Loading categories…":selection.provider==="FKWALLET"?"Choose category":"All categories"}</option>
      {selection.category&&!categories.some(c=>c.id===selection.category)&&<option value={selection.category}>{selection.category}</option>}
      {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select></label>
     {selection.provider!=="FKWALLET"&&<label className="min-w-0 text-sm">Region<select aria-label="Supplier region" className={inputClass} value={selection.region} disabled={filterLoading||!!filterError} onChange={e=>filter({...selection,region:e.target.value})}>
      <option value="">{filterLoading?"Loading regions…":"All regions"}</option>
      {selection.region&&!regions.includes(selection.region)&&<option value={selection.region}>{selection.region}</option>}
      {regions.map(region=><option key={region} value={region}>{region}</option>)}
     </select></label>}
    </div>
    {filterError&&<p role="alert" className="mt-2 text-xs text-amber-800">{filterError} <button type="button" className="font-bold underline" onClick={()=>setFilterAttempt(value=>value+1)}>Retry filters</button></p>}
    <button type="button" onClick={()=>search(1)} className="mt-3 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700">Load supplier products</button>
    {searched&&<div className="mt-3"><p className="mb-2 text-xs text-slate-600">{total} supplier products · Page {page} · {selection.options.length} selected</p><div className="max-h-72 space-y-2 overflow-y-auto">{items.map(item=><label key={item.key} className="flex items-start gap-3 rounded-lg border bg-white p-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={selection.options.some(o=>o.key===item.key)} onChange={()=>toggle(item)}/><span className="min-w-0 flex-1"><strong className="block break-words">{item.name}</strong><span className="text-xs text-slate-500">{item.region||"Supplier catalogue"} · {item.kind==="CODE"?"Voucher":"Top-up"} · Cost {item.cost} {item.costCurrency}</span></span></label>)}{!items.length&&<p className="text-sm">No matching supplier products. Check the search or category.</p>}</div><div className="mt-2 flex gap-2"><button type="button" disabled={pending||page<=1} onClick={()=>search(page-1)} className="rounded border px-3 py-2 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={pending||page*20>=total} onClick={()=>search(page+1)} className="rounded border px-3 py-2 text-xs disabled:opacity-40">Next</button></div></div>}
   </fieldset>
   <fieldset disabled={pending} className="space-y-3"><h3 className="font-bold">Selected denominations ({selection.options.length})</h3><p className="text-xs text-slate-600">Verify value and currency. Match an existing option only when it is the same denomination; this preserves its links and purchase limits.</p>
    {selection.options.map((o,index)=><div key={o.key} className="rounded-xl border p-3"><div className="mb-2 flex items-start justify-between gap-2"><strong className="break-words text-sm">{o.name}</strong><button aria-label={`Remove ${o.name}`} type="button" className="shrink-0 text-xs text-red-700" onClick={()=>edit({...selection,options:selection.options.filter((_,i)=>i!==index)})}>Remove</button></div><div className="grid gap-2 sm:grid-cols-3">
     <label className="text-xs">Denomination<input aria-label={`Denomination for ${o.name}`} className={inputClass} inputMode="decimal" value={o.denomination} onChange={e=>edit({...selection,options:selection.options.map((x,i)=>i===index?{...x,denomination:e.target.value,optionId:null}:x)})}/></label>
     <label className="text-xs">Currency<input aria-label={`Currency for ${o.name}`} className={inputClass} maxLength={3} value={o.currency} onChange={e=>edit({...selection,options:selection.options.map((x,i)=>i===index?{...x,currency:e.target.value.toUpperCase(),optionId:null}:x)})}/></label>
     <label className="text-xs">Existing option<select aria-label={`Match ${o.name}`} className={inputClass} value={o.optionId||""} onChange={e=>edit({...selection,options:selection.options.map((x,i)=>i===index?{...x,optionId:e.target.value||null}:x)})}><option value="">New option</option>{setup.options.filter(x=>Number(x.denomination)===Number(o.denomination)&&x.currency===o.currency&&(!selection.options.some((v,i)=>i!==index&&v.optionId===x.id))).map(x=><option key={x.id} value={x.id}>{x.name}{x.active?"":" (hidden)"}</option>)}</select></label>
    </div></div>)}
    <button type="button" disabled={!selection.options.length||pending} onClick={review} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Preview denominations & prices</button>
   </fieldset>
   {preview&&<section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3" aria-label="Supplier change preview"><h3 className="font-bold">Review {SUPPLIERS[preview.selection.provider]} denominations</h3><p className="mt-1 text-sm">{preview.options.length} options will be active. {preview.hiddenCount} previous options will be hidden.</p>{preview.recipientFields.length>0&&<p className="mt-1 text-sm">Customer fields: {preview.recipientFields.join(", ")}</p>}<ul className="my-3 space-y-2">{preview.options.map((o,i)=><li key={i} className="flex flex-wrap justify-between gap-1 rounded-lg bg-white p-2 text-sm"><span>{o.name}<small className="block text-slate-500">{o.denomination} {o.currency} · Cost {o.cost} {o.costCurrency}</small></span><strong>${Number(o.price).toFixed(2)}</strong></li>)}</ul><button type="button" disabled={pending} onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending?"Saving…":preview.selection.provider===setup.provider?"Apply denomination sync":"Confirm supplier switch"}</button></section>}
  </div>}
  {pending&&<p role="status" className="mt-3 text-sm text-blue-700">Checking supplier…</p>}
  {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
 </section>;
}
