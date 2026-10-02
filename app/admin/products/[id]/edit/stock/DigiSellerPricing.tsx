"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PriceRow } from "@/lib/digiseller-pricing";
import { applyDigiSellerPrices, previewDigiSellerPrices, restoreDigiSellerPrices } from "./pricing-actions";

export default function DigiSellerPricing({productId,initialPercent,ready,needsRecovery,lastSynced}: {
  productId:string;initialPercent:number;ready:boolean;needsRecovery:boolean;lastSynced:string|null;
}) {
  const router=useRouter();
  const [percentages,setPercentages]=useState({prices:String(initialPercent),denominations:String(initialPercent)});
  const [preview,setPreview]=useState<{rows:PriceRow[];approval:string;mode:'prices'|'denominations';percent:string}|null>(null);
  const [notice,setNotice]=useState<{success:boolean;message:string}|null>(null);
  const [recovery,setRecovery]=useState(needsRecovery);
  const [pending,startTransition]=useTransition();
  const [activity,setActivity]=useState('');
  function run(label:string,work:()=>Promise<void>) {
    setActivity(label);setNotice(null);
    startTransition(async()=>{try{await work();}catch{setNotice({success:false,message:'The request could not finish. Refresh this page to check its status before trying again.'});} });
  }
  const money=(value:number)=>`$${value.toFixed(2)}`;
  return <section className="mt-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="text-xl font-black text-slate-900">DigiSeller product sync</h2>
    <p className="mt-1 text-sm text-slate-600">Preview price updates or sync your saved product denominations separately.</p>
    {lastSynced && <p className="mt-2 text-xs text-slate-600">Last successful sync: {new Date(lastSynced).toISOString().replace('T',' ').slice(0,19)} UTC · {initialPercent > 0 ? '+' : ''}{initialPercent}%</p>}
    {!ready && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The DigiSeller pricing database update is needed before you can apply prices.</p>}
    {recovery ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p>A previous update has not finished. Restore the previous sync before starting another update. If an update is still running, wait for it to finish.</p>
      <button disabled={pending||!ready} onClick={()=>run('Restoring prices…',async()=>{const result=await restoreDigiSellerPrices(productId);setNotice(result);setRecovery(result.needsRecovery);router.refresh();})} className="mt-3 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-50">Restore previous sync</button>
    </div> : <>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {(['prices','denominations'] as const).map(mode=><section key={mode} aria-labelledby={`sync-${mode}-heading`} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <h3 id={`sync-${mode}-heading`} className="text-lg font-bold text-slate-900">{mode==='prices'?'Price sync':'Denomination sync'}</h3>
          <p className="mt-2 text-sm text-slate-600">{mode==='prices'?'Update prices for denominations already matched to DigiSeller.':'Add new denominations, update names and prices, and hide removed denominations. Save your website denominations first.'}</p>
          <form className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={event=>{event.preventDefault();setPreview(null);const percent=percentages[mode];run(mode==='prices'?'Loading price preview…':'Loading denomination preview…',async()=>{const result=await previewDigiSellerPrices(productId,percent,mode);if(result.error||!result.approval){setNotice({success:false,message:result.error||'Unable to preview sync.'});}else{setPreview({rows:result.rows,approval:result.approval,mode,percent});}});}}>
            <label className="grid gap-2 text-sm font-bold text-slate-900">Price adjustment (%)
              <input name={`${mode}-percentage`} value={percentages[mode]} onChange={e=>{setPercentages(current=>({...current,[mode]:e.target.value}));setPreview(null);setNotice(null);}} disabled={pending} type="number" min="-99.99" max="1000" step="0.01" required className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 sm:w-40" />
            </label>
            <button disabled={pending} className="rounded-xl border border-blue-700 bg-white px-4 py-3 text-sm font-bold text-blue-800 disabled:opacity-50">{mode==='prices'?'Preview prices':'Preview denominations'}</button>
          </form>
        </section>)}
      </div>
      <p className="mt-3 text-xs text-slate-600">Both use website selling prices in USD, with the adjustment entered in that section. +5% increases $10.00 to $10.50; −2% reduces it to $9.80. Adjustments do not stack. Customer discounts are not included.</p>
      {preview && <div className="mt-5">
        <h3 className="mb-3 text-lg font-bold text-slate-900">{preview.mode==='prices'?'Price sync preview':'Denomination sync preview'}</h3>
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm text-slate-900"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">Denomination</th><th className="p-3 text-right">Website</th><th className="p-3 text-right">DigiSeller now</th><th className="p-3 text-right">New price</th></tr></thead><tbody>{preview.rows.map(row=><tr key={row.id} className="border-t border-slate-200"><td className="p-3 font-semibold">{row.name}{row.change&&<span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{row.change}</span>}{row.change==='Rename'&&<span className="mt-1 block text-xs font-normal text-slate-600">Previously: {row.previousName}</span>}</td><td className="p-3 text-right tabular-nums">{row.change==='Hide'?'—':money(row.website)}</td><td className="p-3 text-right tabular-nums">{row.change==='Add'?'—':money(row.current)}</td><td className="p-3 text-right font-bold tabular-nums text-blue-800">{row.change==='Hide'?'Hidden':money(row.next)}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-xs text-slate-600">Applies the {preview.rows.length} changes shown above. DigiSeller sales briefly pause while the update is checked. Your website prices stay the same.</p>
        <button disabled={pending||!ready} onClick={()=>run(preview.mode==='prices'?'Updating DigiSeller prices…':'Syncing DigiSeller denominations…',async()=>{const result=await applyDigiSellerPrices(productId,preview.percent,preview.approval,preview.mode);setNotice(result);setRecovery(result.needsRecovery);setPreview(null);router.refresh();})} className="admin-save-action mt-3 w-full rounded-xl px-5 py-3 font-bold disabled:opacity-50 sm:w-auto">{preview.mode==='prices'?'Apply price sync':'Apply denomination sync'}</button>
      </div>}
    </>}
    {pending&&<p role="status" className="mt-4 text-sm font-bold text-slate-700">{activity} Keep this page open.</p>}
    {notice&&<p role={notice.success?'status':'alert'} className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${notice.success?'border-emerald-200 bg-emerald-50 text-emerald-900':'border-red-200 bg-red-50 text-red-800'}`}>{notice.message}</p>}
  </section>;
}
