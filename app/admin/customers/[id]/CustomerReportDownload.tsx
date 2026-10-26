"use client";
import { useState } from "react";

export default function CustomerReportDownload({customerId}:{customerId:string}){
 const [timeZone,setTimeZone]=useState("Asia/Kolkata"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function download(){
  if(busy)return;setBusy(true);setError("");
  try{
   const response=await fetch(`/admin/customers/${encodeURIComponent(customerId)}/report?timezone=${encodeURIComponent(timeZone)}`,{credentials:"same-origin",cache:"no-store",redirect:"error"});
   if(!response.ok||!response.headers.get("content-type")?.includes("application/pdf")){const body=await response.json().catch(()=>null);throw Error(body?.error||"Please sign in again and retry the report.");}
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
   link.href=url;link.download=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]||"customer-report.pdf";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e instanceof Error?e.message:"Unable to download the report. Please retry.");}finally{setBusy(false);}
 }
 return <section className="mt-6 rounded-2xl border border-blue-200 bg-white p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">Customer report</h2><p className="mt-1 text-sm text-slate-600">Account details, IP, device and login history, complete wallet activity, payment references and purchased products.</p></div><div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end"><label className="text-xs font-semibold">Report time zone<select aria-label="Report time zone" disabled={busy} value={timeZone} onChange={e=>setTimeZone(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="Asia/Kolkata">India (IST)</option><option value="Europe/Moscow">Moscow (MSK)</option><option value="UTC">UTC</option></select></label><button type="button" disabled={busy} onClick={download} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy?"Generating PDF...":"Download customer report PDF"}</button></div></div>{busy&&<p role="status" className="mt-3 text-sm text-slate-600">Preparing the full history. Large reports can take a little longer.</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</section>;
}
