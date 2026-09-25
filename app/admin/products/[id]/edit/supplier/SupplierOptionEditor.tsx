"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchDefinitePlay, saveDefinitePlayMapping } from "@/app/admin/definiteplay/actions";
import type { DefinitePlayItem, DefinitePlayMapping } from "@/lib/definiteplay-types";

function ItemDetails({item}:{item:DefinitePlayItem}) {
  return <div className="text-sm"><p className="font-bold">{item.name}</p>
    <p className="mt-1">{item.region} Â· {item.cardValue} {item.cardCurrency} Â· Supplier cost: {item.currency} {item.price}</p>
    <p className="mt-1 text-slate-500">Code: {item.sku} Â· {item.available?(item.stock===null?"Available; quantity unspecified":item.stock+" available"):"Out of stock"} Â· {item.asyncOnly?"Processing required":"Standard processing"} Â· {item.deliveryMethod}</p>
  </div>;
}
export default function SupplierOptionEditor({productId,option,mapping}:{
  productId:string;
  option:{id:string;option_name:string|null;denomination:number;denomination_currency:string|null;selling_price:number|null};
  mapping:DefinitePlayMapping|null;
}) {
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [items,setItems]=useState<DefinitePlayItem[]>([]);
  const [selected,setSelected]=useState<DefinitePlayItem|null>(null);
  const [searchStatus,setSearchStatus]=useState("");
  const [stale,setStale]=useState(false);
  const [message,setMessage]=useState("");
  const [pending,startTransition]=useTransition();
  const request=useRef(0);
  useEffect(()=>{
    const version=++request.current;
    let active=true;
    if(query.trim().length<2) return;
    const timer=setTimeout(()=>{
      void searchDefinitePlay(query).then(result=>{
        if(!active||version!==request.current)return;
        setItems(result.items);setStale(Boolean(result.stale));
        setSearchStatus(result.error??(result.stale?"Supplier data is out of date. Refresh the supplier catalogue first.":result.items.length?"":"No matching products."));
      }).catch(()=>{
        if(active&&version===request.current)setSearchStatus("Search unavailable. Please try again.");
      });
    },400);
    return ()=>{active=false;clearTimeout(timer);};
  },[query]);
  function save(sku:string|null) {
    startTransition(async()=>{
      const result=await saveDefinitePlayMapping(productId,option.id,sku);
      setMessage(result.error??(sku?"Supplier link saved.":"Supplier link removed."));
      if(result.success){setSelected(null);setQuery("");setItems([]);setSearchStatus("");router.refresh();}
    });
  }
  return <article className="rounded-xl border border-slate-200 p-4">
    <h3 className="font-black">{option.option_name||option.denomination}</h3>
    <p className="mt-1 text-sm text-slate-500">Website value: {option.denomination} {option.denomination_currency} Â· Selling price: USD {Number(option.selling_price??0).toFixed(2)}</p>
    <div className="mt-3 rounded-lg bg-slate-50 p-3">{mapping?.supplier?<><p className="mb-2 text-xs font-bold uppercase text-emerald-700">Linked supplier item</p><ItemDetails item={mapping.supplier}/></>:<p className="text-sm">{mapping?"Linked code "+mapping.sku+" is no longer in the current supplier catalogue.":"No supplier item linked."}</p>}</div>
    <label className="mt-4 block text-sm font-bold" htmlFor={"supplier-search-"+option.id}>Search supplier product or code</label>
    <input id={"supplier-search-"+option.id} value={query} disabled={pending} onChange={e=>{setQuery(e.target.value);setSelected(null);setItems([]);setStale(false);setSearchStatus(e.target.value.trim().length>=2?"Searchingâ€¦":"");}} placeholder="For example: Apple 10 USD" className="mt-2 w-full rounded-lg border px-3 py-2"/>
    {searchStatus&&<p role="status" className="mt-2 text-sm text-slate-600">{searchStatus}</p>}
    {items.length>0&&<div className="mt-2 max-h-80 space-y-2 overflow-y-auto">{items.map(item=><label key={item.sku} className={"flex cursor-pointer gap-3 rounded-lg border p-3 "+(selected?.sku===item.sku?"border-blue-600 bg-blue-50":"border-slate-200")}>
      <input type="radio" name={"supplier-"+option.id} value={item.sku} checked={selected?.sku===item.sku} disabled={pending||stale} onChange={()=>setSelected(item)}/><ItemDetails item={item}/>
    </label>)}</div>}
    {selected&&<p className="mt-3 text-sm text-blue-800">Save will link this option to {selected.name} ({selected.sku}).</p>}
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={pending||!selected||stale} onClick={()=>selected&&save(selected.sku)} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{pending?"Savingâ€¦":"Save supplier link"}</button>
      {mapping&&<button type="button" disabled={pending} onClick={()=>save(null)} className="rounded-lg border px-4 py-2 font-bold text-red-700 disabled:opacity-40">Remove link</button>}</div>
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </article>;
}
