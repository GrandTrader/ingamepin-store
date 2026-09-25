"use client";
import {useState,useTransition,useEffect} from "react";
import {useRouter} from "next/navigation";
import {refreshDefinitePlay} from "./actions";

export default function RefreshButton({syncedAt}:{syncedAt:string|null}) {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [waiting,setWaiting]=useState(false);
  const [message,setMessage]=useState("");
  const [started,setStarted]=useState<string|null>(null);
  useEffect(()=>{
    if (!waiting) return;
    if (syncedAt !== started) return;
    const interval=setInterval(()=>router.refresh(),5000);
    const timeout=setTimeout(()=>{setWaiting(false);setMessage("Refresh is taking longer than expected. Check the connection status below.");},90000);
    return ()=>{clearInterval(interval);clearTimeout(timeout);};
  },[waiting,syncedAt,started,router]);
  const refreshing=waiting && syncedAt===started;
  return <div>
    <button disabled={pending||refreshing} onClick={()=>startTransition(async()=>{
      setMessage("");
      const result=await refreshDefinitePlay();
      if(result.error){setMessage(result.error);return;}
      setStarted(syncedAt);setWaiting(true);router.refresh();
    })} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
      {pending||refreshing?"Refreshing…":"Refresh supplier data"}
    </button>
    {message&&<p role="status" className="mt-2 max-w-sm text-sm text-amber-800">{message}</p>}
  </div>;
}
