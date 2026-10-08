"use client";
import { useEffect, useRef, useState } from "react";
import { refreshCartPrices, type PriceCartItem } from "@/lib/cart-prices";
export function useCartPrices<T extends PriceCartItem>(items:T[], update:(items:T[])=>void){
 const [error,setError]=useState(""),[loading,setLoading]=useState(false);
 const current=useRef(items),save=useRef(update);
 useEffect(()=>{current.current=items;save.current=update;},[items,update]);
 const key=JSON.stringify(items.map(i=>[i.productOptionId,i.customValue]));
 useEffect(()=>{
  if(!current.current.length)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;let controller:AbortController|undefined;
  const refresh=async()=>{
   controller?.abort();controller=new AbortController();setLoading(true);
   try{
    const quoted=await refreshCartPrices(current.current,controller.signal);
    if(cancelled)return;
    // Preserve quantities or details edited while this request was in flight.
    const next=current.current.map((item,index)=>{
     const q=quoted[index];
     return {...item,price:q.price,unitPrice:q.unitPrice,totalPrice:Number(q.price)*item.quantity,regularPrice:q.regularPrice,salePercent:q.salePercent,saleEndsAt:q.saleEndsAt,expectedSaleUnitPrice:q.expectedSaleUnitPrice};
    });
    save.current(next);setError("");
    const expiry=Math.min(...next.map(i=>Date.parse(i.saleEndsAt??"")).filter(t=>t>Date.now()));
    clearTimeout(timer);timer=setTimeout(refresh,Math.min(60000,Math.max(100,expiry-Date.now()+25)));
   }catch(e){if(!cancelled&&!(e instanceof DOMException&&e.name==="AbortError")){setError(e instanceof Error?e.message:"Unable to refresh prices.");timer=setTimeout(refresh,30000);}}
   finally{if(!cancelled)setLoading(false);}
  };
  void refresh();window.addEventListener("focus",refresh);
  return()=>{cancelled=true;controller?.abort();clearTimeout(timer);window.removeEventListener("focus",refresh);};
 },[key]);
 return {error,loading};
}
