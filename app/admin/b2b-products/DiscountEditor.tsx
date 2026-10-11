"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveB2BDiscounts, setB2BProductAvailability } from "./actions";
export type DiscountProduct={id:string;name:string;region:string|null;status:string;businessEnabled:boolean;preorder:boolean;general:number;percent:number;revision:string|null;locked:boolean};
const valid=(value:string)=>value.trim()!=="" && /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value)<=99.99;
export default function DiscountEditor({products,email,customerId,canEditDiscounts=true}:{products:DiscountProduct[];email:string;customerId:string|null;canEditDiscounts?:boolean}) {
  const router=useRouter(),[pending,startTransition]=useTransition();
  const [selected,setSelected]=useState<string[]>([]),[values,setValues]=useState<Record<string,string>>(Object.fromEntries(products.map(p=>[p.id,String(p.percent)]))),[bulk,setBulk]=useState("");
  const [error,setError]=useState(""),[success,setSuccess]=useState(""),[operation,setOperation]=useState("");
  const selectable=products.filter(p=>!p.preorder), all=selectable.length>0&&selected.length===selectable.length;
  const canDiscount=(p:DiscountProduct)=>canEditDiscounts&&p.businessEnabled&&!p.locked&&!p.preorder;
  const chosen=products.filter(p=>selected.includes(p.id));
  const choose=(id:string,on:boolean)=>{setSelected(v=>on?[...new Set([...v,id])]:v.filter(x=>x!==id));setSuccess("");};
  const checkDiscountSelection=()=>{
    if(!selected.length){setError("Select at least one product.");return false;}
    if(chosen.some(p=>!canDiscount(p))){setError("Discounts require enabled B2B products with store-managed pricing. Select eligible products only.");return false;}
    return true;
  };
  const apply=()=>{
    setSuccess("");if(!checkDiscountSelection())return;
    if(!valid(bulk)){setError("Enter a discount from 0 to 99.99 with up to two decimals.");return;}
    setValues(v=>({...v,...Object.fromEntries(selected.map(id=>[id,bulk]))}));setError("");
  };
  const save=()=>{
    setError("");setSuccess("");
    if(!checkDiscountSelection())return;
    if(selected.some(id=>!valid(values[id]))){setError("Enter a discount from 0 to 99.99 with up to two decimals.");return;}
    setOperation("discount");
    startTransition(async()=>{
      try{
        const result=await saveB2BDiscounts({email,customerId,changes:chosen.map(p=>({productId:p.id,percent:Number(values[p.id]),revision:p.revision}))});
        if(result.error)setError(result.error);
        else {setSuccess(result.success??"Discounts saved.");setSelected([]);router.refresh();}
      }catch{setError("Could not save discounts. Please try again.");}
    });
  };
  const availability=(enabled:boolean)=>{
    if(!selected.length)return;
    setError("");setSuccess("");setOperation("availability");
    startTransition(async()=>{
      try{
        const result=await setB2BProductAvailability(selected,enabled);
        if(result.error)setError(result.error);
        else {setSuccess(result.success??"B2B availability saved.");setSelected([]);router.refresh();}
      }catch{setError("Could not update B2B availability. Please try again.");}
    });
  };
  return <div className="space-y-4">
    <fieldset disabled={pending} className="min-w-0 space-y-4 disabled:opacity-60">
      <div className="space-y-3 rounded-xl bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={()=>availability(true)} disabled={!selected.length} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Activate selected in B2B</button>
          <button type="button" onClick={()=>availability(false)} disabled={!selected.length} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Deactivate selected in B2B</button>
          <span className="text-sm text-slate-600">{pending&&operation==="availability"?"Updating…":`${selected.length} selected`}</span>
        </div>
        <p className="text-xs text-slate-600">These buttons change B2B availability for everyone. Retail availability stays unchanged. Draft or suspended products must also be published in Products.</p>
      </div>
      {canEditDiscounts&&<div className="space-y-3 rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-600">Discounts apply to all denominations of selected products. Set 0% to clear this rule; other applicable discounts can still apply.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Discount (%)<input aria-label="Bulk discount percentage" type="number" min="0" max="99.99" step="0.01" value={bulk} onChange={e=>setBulk(e.target.value)} placeholder="e.g. 5" className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2"/></label>
          <button type="button" onClick={apply} disabled={!selected.length} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Apply to selected</button>
        </div>
      </div>}
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={all} disabled={!selectable.length} onChange={e=>{setSelected(e.target.checked?selectable.map(p=>p.id):[]);setSuccess("");}}/>Select all on this page</label>
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
        {!products.length&&<p className="p-5 text-sm text-slate-500">No products match these filters.</p>}
        {products.map(p=><div key={p.id} className="flex flex-wrap items-center gap-4 p-4">
          <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.includes(p.id)} disabled={p.preorder} onChange={e=>choose(p.id,e.target.checked)}/>
          <div className="min-w-0 flex-1 basis-48"><p className="break-words text-sm font-semibold">{p.name}</p><p className="mt-1 text-xs text-slate-500">{p.region||"Global"} · {p.status==="INACTIVE"?"Suspended":p.status.toLowerCase()}</p>
            <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${p.businessEnabled&&!p.preorder?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{p.preorder?"Pre-order: B2B unavailable":p.businessEnabled?"Enabled in B2B":"Not enabled in B2B"}</span>
            {customerId&&canEditDiscounts&&<p className="mt-1 text-xs text-slate-600">General B2B discount: {p.general}%</p>}{p.locked&&<p className="mt-1 text-xs text-amber-700">Seller-managed pricing</p>}
          </div>
          {canEditDiscounts?<label className="text-xs text-slate-600">{customerId?"Customer discount":"B2B discount"}<div className="mt-1 flex items-center gap-2"><input aria-label={`Discount for ${p.name}`} disabled={!canDiscount(p)} type="number" min="0" max="99.99" step="0.01" value={values[p.id]} onChange={e=>{setValues(v=>({...v,[p.id]:e.target.value}));choose(p.id,true);setError("");}} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"/><span>%</span></div></label>:<span className="text-xs text-slate-500">Discount editing unavailable</span>}
        </div>)}
      </div>
      {canEditDiscounts&&<button type="button" onClick={save} disabled={!selected.length} className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending&&operation==="discount"?"Saving…":"Save selected discounts"}</button>}
    </fieldset>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {success&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
  </div>;
}
