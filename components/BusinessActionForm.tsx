"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
type Result={error?:string;success?:string};
export default function BusinessActionForm({action,children,button}:{action:(form:FormData)=>Promise<Result>;children:ReactNode;button:string}) {
  const router=useRouter(); const [pending,start]=useTransition(); const [result,setResult]=useState<Result>({});
  return <form className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setResult({});start(async()=>{try{const response=await action(data);setResult(response);if(response.success)router.refresh();}catch{setResult({error:"Unable to complete this request. Refresh and try again."});}});}}>
    <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">{children}<button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50" disabled={pending}>{pending?"Saving…":button}</button></fieldset>
    {result.error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{result.error}</p>}
    {result.success&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{result.success}</p>}
  </form>;
}
