"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { configureSupplierDelivery } from "@/app/admin/definiteplay/fulfillment-actions";

export default function SupplierDeliveryControl({productId,enabled,configured}:{productId:string;enabled:boolean;configured:boolean}) {
  const [pending,startTransition]=useTransition();
  const [message,setMessage]=useState("");
  const router=useRouter();
  return <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
    <h2 className="text-xl font-black">Supplier stock and delivery</h2>
    <p className="mt-2 text-sm">{enabled
      ? "Supplier stock is updated automatically. Verified paid orders are purchased from Definite Play and their codes appear on the customer's order page."
      : "Enable this after linking every denomination. Your selling prices stay under your control."}</p>
    {!configured ? <p className="mt-3 text-sm font-semibold text-amber-800">Setup pending. Automatic purchases are disabled.</p> :
      <button disabled={pending} onClick={()=>startTransition(async()=>{
        const result=await configureSupplierDelivery(productId,!enabled);
        setMessage(result.error??(enabled?"Supplier delivery disabled.":"Enabled. Stock will appear after the next supplier sync."));
        if(result.success)router.refresh();
      })} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">
        {pending?"Saving…":enabled?"Use uploaded stock instead":"Enable supplier stock and delivery"}
      </button>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
