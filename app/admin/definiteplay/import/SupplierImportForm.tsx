"use client";
import PaypalychProductWarning from "@/components/PaypalychProductWarning";
import Link from "next/link";
import {useRef,useState,useTransition} from "react";
import type {DefinitePlayItem} from "@/lib/definiteplay-types";
import {priceWithMarkup,supplierDefaultDenomination,supplierSubscriptionMonths} from "@/lib/definiteplay-import";
import {importSupplierProduct} from "./actions";
import {createSupplierImportCategory} from "./category-actions";

export default function SupplierImportForm({items,categories,requestId}:{items:DefinitePlayItem[];categories:{id:string;name:string}[];requestId:string}) {
  const [importId]=useState(requestId);
  const [selected,setSelected]=useState(()=>items.map(i=>i.sku));
  const [categoryId,setCategoryId]=useState("");
  const [createdCategories,setCreatedCategories]=useState<{id:string;name:string}[]>([]);
  const categoryOptions=[...categories,...createdCategories.filter(c=>!categories.some(existing=>existing.id===c.id))].sort((a,b)=>a.name.localeCompare(b.name));
  const [creatingCategory,setCreatingCategory]=useState(false);
  const [categoryName,setCategoryName]=useState("");
  const [categoryType,setCategoryType]=useState("GIFT_CARD");
  const [categoryMessage,setCategoryMessage]=useState("");
  const categorySubmitting=useRef(false);
  const [title,setTitle]=useState(()=>items.length===1?items[0].name.slice(0,150):[items[0].brand,items[0].region,"— Digital Codes"].filter(Boolean).join(" ").slice(0,150));
  const [titleRu,setTitleRu]=useState("");
  const [description,setDescription]=useState("");
  const [descriptionRu,setDescriptionRu]=useState("");
  const [markup,setMarkup]=useState("0");
  const [prices,setPrices]=useState<Record<string,string>>({});
  const [values,setValues]=useState(()=>Object.fromEntries(items.map(i=>[i.sku,supplierDefaultDenomination(i)])));
  const [currencies,setCurrencies]=useState(()=>Object.fromEntries(items.map(i=>[i.sku,/^[A-Z]{3}$/.test(i.cardCurrency)?i.cardCurrency:"USD"])));
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<{productId:string;warning?:string}|null>(null);
  const [pending,startTransition]=useTransition();
  const submitting=useRef(false);
  let markupError="";
  try{priceWithMarkup("1",markup);}catch(e){markupError=e instanceof Error?e.message:"Invalid markup.";}
  function suggested(item:DefinitePlayItem){try{return priceWithMarkup(item.price,markup);}catch{return "";}}
  function createCategory(){
    if(pending||categorySubmitting.current)return;
    categorySubmitting.current=true;setCategoryMessage("");
    startTransition(async()=>{
      try {
        const response=await createSupplierImportCategory(categoryName,categoryType);
        if(response.category){
          const category=response.category;
          setCreatedCategories(previous=>[...previous.filter(c=>c.id!==category.id),category]);
          setCategoryId(category.id);setCreatingCategory(false);setCategoryName("");
          setCategoryMessage(category.name+" selected.");
        }else setCategoryMessage(response.error??"Unable to create category.");
      }catch{setCategoryMessage("Unable to confirm category creation. Retry with the same name.");}
      finally{categorySubmitting.current=false;}
    });
  }
  function save(){
    if(pending||submitting.current||categorySubmitting.current||creatingCategory||result)return;
    submitting.current=true;setMessage("");
    startTransition(async()=>{
      try {
        const response=await importSupplierProduct({
          requestId:importId,categoryId,title,titleRu,description,descriptionRu,markup,
          options:items.filter(i=>selected.includes(i.sku)).map(i=>({
            sku:i.sku,expectedCost:i.price,price:prices[i.sku],
            denomination:values[i.sku],currency:currencies[i.sku],
          })),
        });
        if(response.productId)setResult({productId:response.productId,warning:response.warning});
        else setMessage(response.error??"Unable to confirm the import. Check the product list before retrying.");
      }catch{setMessage("Unable to confirm the import. Retry on this page to check the same draft.");}
      finally{submitting.current=false;}
    });
  }
  if(result)return <section className="mt-6 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-bold">Draft created</h2>
    <PaypalychProductWarning identities={[title,titleRu,...items.filter(i=>selected.includes(i.sku)).map(i=>i.name)]} />
    <p className="mt-2 text-slate-600">Review its details, image and selling prices before publishing. Automatic supplier delivery is not enabled.</p>
    {result.warning&&<p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">{result.warning}</p>}
    <Link className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-bold text-white" href={"/admin/products/"+result.productId+"/edit/general"}>Review draft</Link>
  </section>;
  return <form onSubmit={e=>{e.preventDefault();save();}} className="mt-6 space-y-5">
    <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">The product will be saved as a draft with zero sellable stock. Supplier links will be saved automatically. No supplier purchase is made.</p>
    <PaypalychProductWarning identities={[title,titleRu,categoryOptions.find(c=>c.id===categoryId)?.name,...items.filter(i=>selected.includes(i.sku)).flatMap(i=>[i.name,i.brand])]} />
    <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
      <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">Website category
          <select required value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal"><option value="">Choose category</option>{categoryOptions.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <div className="sm:col-span-2">
          {!creatingCategory?<button type="button" onClick={()=>{setCreatingCategory(true);setCategoryMessage("");}} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">+ Create new category</button>:
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h2 className="font-bold">Create product category</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold">Category name<input maxLength={100} value={categoryName} onChange={e=>setCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();createCategory();}}} placeholder="For example: PlayStation" className="mt-2 w-full rounded-lg border bg-white p-3 font-normal"/></label>
                <label className="text-sm font-bold">Category type<select value={categoryType} onChange={e=>setCategoryType(e.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3 font-normal">
                  <option value="GIFT_CARD">Gift cards</option><option value="SUBSCRIPTION">Subscriptions</option><option value="GAME_KEY">Game keys</option><option value="GAME_TOPUP">Game top-ups</option><option value="DIGITAL_PRODUCT">Other digital products</option>
                </select></label>
              </div>
              <p className="mt-3 text-xs text-slate-600">Creates an active category and selects it here. You can add its image and description under Catalog → Categories.</p>
              <div className="mt-3 flex gap-3"><button type="button" onClick={createCategory} disabled={pending||categoryName.trim().length<2} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-40">{pending?"Creating…":"Create and select"}</button>
                <button type="button" onClick={()=>setCreatingCategory(false)} className="rounded-lg border bg-white px-4 py-2 font-bold">Cancel</button></div>
            </div>}
          {categoryMessage&&<p role="status" className="mt-3 text-sm">{categoryMessage}</p>}
        </div>
        <label className="text-sm font-bold">Product title (English)<input required minLength={2} maxLength={150} value={title} onChange={e=>setTitle(e.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Product title (Russian, optional)<input maxLength={150} value={titleRu} onChange={e=>setTitleRu(e.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Description (English)<textarea rows={4} maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Description (Russian, optional)<textarea rows={4} maxLength={5000} value={descriptionRu} onChange={e=>setDescriptionRu(e.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal"/></label>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-black">Set your selling prices</h2>
        <p className="mt-1 text-sm text-slate-600">Markup applies to supplier cost, not card value. Prices are saved in USD and will stay fixed until you change them.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-bold">Markup (%)<input type="number" required min="0" max="1000" step="0.01" value={markup} onChange={e=>setMarkup(e.target.value)} className="mt-2 block w-36 rounded-lg border p-3 font-normal"/></label>
          <button type="button" onClick={()=>setPrices({})} className="rounded-lg bg-blue-50 px-4 py-3 font-bold text-blue-700">Apply markup to all prices</button></div>
        <p className="mt-2 text-xs text-slate-500">Manual prices stay unchanged when you edit markup. “Apply markup to all prices” replaces manual prices.</p>
        {markupError&&<p role="alert" className="mt-2 text-sm text-red-700">{markupError}</p>}
        <div className="my-4 flex flex-wrap gap-4 text-sm"><span className="font-bold">{selected.length} selected</span>
          <button type="button" onClick={()=>setSelected(items.map(i=>i.sku))} className="text-blue-600">Select all</button>
          <button type="button" onClick={()=>setSelected([])} className="text-blue-600">Clear selection</button></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Include / supplier item","Value","Currency","Supplier cost","Your price (USD)"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{items.map(item=><tr key={item.sku} className="border-t">
            <td className="min-w-52 p-2"><label className="flex gap-2"><input type="checkbox" checked={selected.includes(item.sku)} onChange={e=>setSelected(e.target.checked?[...selected,item.sku]:selected.filter(s=>s!==item.sku))}/><span>{item.name}<small className="block text-slate-500">{item.sku} · {item.region} · {item.available?"Supplier available":"Supplier out of stock"}</small></span></label></td>
            <td className="p-2"><input aria-label={"Denomination for "+item.name} type="number" min="1" max="1000000000" step="1" readOnly={supplierSubscriptionMonths(item)!==null} required={selected.includes(item.sku)} disabled={!selected.includes(item.sku)} value={values[item.sku]} onChange={e=>setValues({...values,[item.sku]:e.target.value})} className="w-24 rounded-lg border p-2"/>{supplierSubscriptionMonths(item)!==null&&<small className="block text-slate-500">Months</small>}</td>
            <td className="p-2">{supplierSubscriptionMonths(item)!==null?<span>Subscription</span>:<input aria-label={"Denomination currency for "+item.name} required={selected.includes(item.sku)} disabled={!selected.includes(item.sku)} pattern="[A-Z]{3}" maxLength={3} value={currencies[item.sku]} onChange={e=>setCurrencies({...currencies,[item.sku]:e.target.value.toUpperCase()})} className="w-20 rounded-lg border p-2"/>}</td>
            <td className="whitespace-nowrap p-2">USD {item.price}</td>
            <td className="p-2"><input aria-label={"Selling price for "+item.name} type="number" min="0.01" max="9999999.99" step="0.01" required={selected.includes(item.sku)} disabled={!selected.includes(item.sku)} value={prices[item.sku]??suggested(item)} onChange={e=>setPrices({...prices,[item.sku]:e.target.value})} className="w-28 rounded-lg border p-2"/>{prices[item.sku]!==undefined&&<small className="block text-blue-600">Manual price</small>}</td>
          </tr>)}</tbody></table></div>
        <p className="mt-3 text-xs text-slate-500">Game Pass values show the subscription length in months. Other denominations must be whole numbers. Items without a numeric card value start at 1; the full product name identifies the edition or plan.</p>
      </section>
      <button disabled={pending||!selected.length||Boolean(markupError)||!categoryOptions.length||creatingCategory} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-40">{pending?(creatingCategory?"Creating category…":"Creating draft…"):"Create draft product"}</button>
    </fieldset>
    {message&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{message}</p>}
  </form>;
}
