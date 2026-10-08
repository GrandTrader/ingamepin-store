"use client";
import { useState, useTransition } from "react";
import { discountedPrice, fromIndiaInput, toIndiaInput, type PromotionRule } from "@/lib/product-promotions";
type Option={id:string;name:string;price:number;priceLabel?:string};
type Draft={optionId:string|null;mode:"inherit"|"off"|"discount";percent:string;expiry:string};
export default function ProductDiscountEditor({options,rules,ready,productId,revision,action}:{options:Option[];rules:PromotionRule[];ready:boolean;productId:string;revision:string;action:(form:FormData)=>void|Promise<void>}){
 const [drafts,setDrafts]=useState<Draft[]>([null,...options.map(o=>o.id)].map(optionId=>{
  const rule=rules.find(r=>r.optionId===optionId);
  return {optionId,mode:rule?(rule.percent>0?"discount":optionId===null?"inherit":"off"):"inherit",percent:String(rule?.percent??""),expiry:toIndiaInput(rule?.endsAt??null)};
 }));
 const [error,setError]=useState("");
 const [pending,startTransition]=useTransition();
 const update=(index:number,change:Partial<Draft>)=>setDrafts(current=>current.map((r,i)=>i===index?{...r,...change}:r));
 let payload:PromotionRule[]=[];
 try{payload=drafts.filter(d=>d.mode!=="inherit").map(d=>({optionId:d.optionId,percent:d.mode==="off"?0:Number(d.percent),endsAt:d.mode==="off"?null:fromIndiaInput(d.expiry)}));}catch{}
 function validate(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(pending||!ready)return;
  setError("");
  try{
   for(const d of drafts.filter(d=>d.mode==="discount")){
    if(!d.percent.trim()||!Number.isFinite(Number(d.percent))||Number(d.percent)<=0||Number(d.percent)>=100)throw Error("Enter a discount greater than 0% and less than 100%.");
    const expiry=fromIndiaInput(d.expiry);
    const previous=rules.find(r=>r.optionId===d.optionId);
    if(Date.parse(expiry)<=Date.now() && !(previous?.endsAt===expiry && previous.percent===Number(d.percent)))throw Error("Choose a future expiry date for new or changed discounts.");
   }
  }catch(e){setError(e instanceof Error?e.message:"Check discount settings.");return;}
  const form=new FormData(event.currentTarget);
  // Keep controlled selections visible until the server redirects with saved settings.
  startTransition(async()=>{await action(form);});
 }
 return <form onSubmit={validate} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
 <input type="hidden" name="id" value={productId}/><input type="hidden" name="revision" value={revision}/>
 <h2 className="text-xl font-black">Sale discounts</h2>
 <p className="mt-1 text-sm text-slate-600">Set a product discount or a different discount for each denomination. Normal prices are kept. The larger of the sale and personal customer discounts applies.</p>
 <p className="mt-2 text-sm font-bold text-blue-700">Expiry date and time: India (IST, UTC+05:30)</p>
 <input type="hidden" name="rules" value={JSON.stringify(payload)}/>
 {!ready&&<p role="status" className="my-3 rounded-lg bg-amber-50 p-3 text-amber-800">Install the discount database update before saving.</p>}
 <div className="mt-4 grid gap-3">{drafts.map((d,index)=>{
  const option=options.find(o=>o.id===d.optionId);
  const applied=d.mode==="inherit"?drafts[0]:d;
  const percent=applied.mode==="discount"&&Date.parse(applied.expiry+":00+05:30")>Date.now()?Number(applied.percent):0;
  return <div key={d.optionId??"all"} className={index===0?"rounded-xl border border-blue-200 bg-blue-50 p-4":"rounded-xl border border-slate-200 p-4"}>
   <p className="font-bold">{option?.name??"Whole product · all denominations and ranges"}</p>
   {option&&<p className="mt-1 text-xs text-slate-500">{option.priceLabel??"Normal price"}: ${option.price.toFixed(2)} USD</p>}
   <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_1.3fr]">
    <label className="text-sm font-bold">Discount<select aria-label={`Discount for ${option?.name??"whole product"}`} value={d.mode} disabled={!ready} onChange={e=>update(index,{mode:e.target.value as Draft["mode"]})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5">
     <option value="inherit">{index===0?"No product discount":"Use product discount"}</option><option value="discount">Set percentage</option>{index>0&&<option value="off">No discount</option>}
    </select></label>
    <label className="text-sm font-bold">Discount %<input aria-label={`Percentage for ${option?.name??"whole product"}`} type="number" min="0.01" max="99.99" step="0.01" disabled={!ready||d.mode!=="discount"} required={d.mode==="discount"} value={d.percent} onChange={e=>update(index,{percent:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"/></label>
    <label className="text-sm font-bold">Ends at (IST)<input aria-label={`Expiry for ${option?.name??"whole product"}`} type="datetime-local" required={d.mode==="discount"} disabled={!ready||d.mode!=="discount"} value={d.expiry} onChange={e=>update(index,{expiry:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"/></label>
   </div>
   {option&&percent>0&&percent<100&&<p className="mt-2 text-sm font-bold text-emerald-700">Sale price: ${discountedPrice(option.price,percent).toFixed(2)} USD</p>}
   {d.mode==="discount"&&d.expiry&&Date.parse(d.expiry+":00+05:30")<=Date.now()&&<p className="mt-2 text-sm text-amber-700">Expired · normal pricing applies.</p>}
   {index>0&&d.mode!=="inherit"&&<p className="mt-2 text-xs text-slate-500">Overrides the product discount. After expiry, this denomination returns to its normal price.</p>}
  </div>;
 })}</div>
 {error&&<p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
 <div className="mt-4 flex justify-end"><button disabled={!ready||pending} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{pending?"Saving…":"Save discounts"}</button></div>
 </form>;
}
