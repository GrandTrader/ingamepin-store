"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import PortalCheckout from "./PortalCheckout";
import { portalCartItem, usd, type PortalProduct, type PortalOption } from "@/lib/business-portal";
import { rangePrice, type ProductRange } from "@/lib/product-range";
import s from "../Portal.module.css";
type DraftItem=ReturnType<typeof portalCartItem> & {customValue?:number};
const draftKey=(item:DraftItem)=>item.productOptionId+(item.customValue===undefined?"":":"+item.customValue);
type Limit={productOptionId:string;availableQuantity:number|null;minimumQuantity:number;maximumQuantity:number|null};
export default function ProductTable({userId,products,discounts,filters,stockProducts=products,ranges=[]}:{ranges?:ProductRange[];userId:string;products:PortalProduct[];stockProducts?:PortalProduct[];discounts:Record<string,number>;filters:React.ReactNode}) {
  const key="business-order-draft:"+userId;
  const [draft,setDraft]=useState<DraftItem[]>([]), [ready,setReady]=useState(false), [busy]=useState(false), [message,setMessage]=useState(""), [error,setError]=useState("");
  const [quantities,setQuantities]=useState<Record<string,string>>({}),[limits,setLimits]=useState<Record<string,Limit>>({}),[stockError,setStockError]=useState("");
  const [review,setReview]=useState(false);
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  useEffect(()=>{
    try { const value=JSON.parse(localStorage.getItem(key)??"[]"); if(Array.isArray(value)) { // Hydrate this customer's browser draft only after mounting.
      setDraft(value.filter(i=>i&&typeof i.productId==="string"&&typeof i.productOptionId==="string"&&Number.isSafeInteger(i.quantity)&&i.quantity>0&&Number.isFinite(i.unitPrice)).slice(0,100));
    }}catch{setError("Unable to restore your saved draft.");}
    if(localStorage.getItem("business-order-confirm:"+userId))setReview(true);
    setReady(true);
  },[key,userId]);
  useEffect(()=>{
    const controller=new AbortController();
    async function check(){
      const items=stockProducts.flatMap(p=>p.product_options.filter(o=>o.is_active).map(o=>({productId:p.id,productOptionId:o.id})));
      const next:Record<string,Limit>={};
      try {
        for(let i=0;i<items.length;i+=100){const r=await fetch("/api/products/quantity-limits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:items.slice(i,i+100)}),signal:controller.signal});const data=await r.json();if(!r.ok||!Array.isArray(data.limits))throw Error(data.error??"Unable to check current stock.");for(const l of data.limits)next[l.productOptionId]=l;}
        if(!controller.signal.aborted){setLimits(next);setStockError("");}
      }catch(e){if(!controller.signal.aborted)setStockError(e instanceof Error?e.message:"Stock check unavailable.");}
    }
    void check();return()=>controller.abort();
  },[stockProducts]);
  function save(next:DraftItem[]){localStorage.setItem(key,JSON.stringify(next));setDraft(next);}
  function add(product:PortalProduct,option:PortalOption,range?:ProductRange){
    setError("");setMessage("");
    try{
      const minimum=Math.max(product.minimum_quantity??1,option.minimum_quantity??1,1), quantity=Number(quantities[option.id]??minimum);
      const value=range?Number(amounts[option.id]??""):undefined;
      const unitPrice=range?rangePrice(range,value!):Number(option.selling_price);
      if(range&&range.delivery_mode!=="MANUAL")throw Error("This range is not available for ordering yet.");
      const existing=draft.find(i=>i.productOptionId===option.id&&i.customValue===value), combined=(existing?.quantity??0)+quantity;
      const optionQuantity=draft.filter(i=>i.productOptionId===option.id).reduce((n,i)=>n+i.quantity,0)+quantity;
      if(!Number.isSafeInteger(quantity)||quantity<minimum)throw Error(`Minimum quantity is ${minimum}.`);
      const limit=limits[option.id];if(!limit)throw Error("Wait for the stock check to finish.");
      if(limit.availableQuantity!==null&&optionQuantity>limit.availableQuantity)throw Error(`Only ${limit.availableQuantity} available. Your draft already has ${existing?.quantity??0}.`);
      if(combined<limit.minimumQuantity||(limit.maximumQuantity!==null&&optionQuantity>limit.maximumQuantity))throw Error("The requested quantity is outside the current purchase limits.");
      const item:DraftItem=portalCartItem(product,range?{...option,is_custom_value:false,selling_price:unitPrice}:option,combined);
      if(range){item.customValue=value;item.denomination=value!;item.amount=value!;item.editionName=`${value} ${range.currency}`;item.deliveryType="MANUAL";item.id=draftKey(item);item.cartId=item.id;}
      if(!existing&&draft.length>=100)throw Error("Use up to 100 options in one draft.");
      save([...draft.filter(i=>draftKey(i)!==draftKey(item)),item]);setMessage(`${product.name} added to your draft.`);
    }catch(e){setError(e instanceof Error?e.message:"Unable to save the draft.");}
  }
  function proceed(){if(ready&&!busy&&draft.length)setReview(true);}
  if(review)return <PortalCheckout userId={userId} items={draft} onBack={()=>setReview(false)} onComplete={()=>{localStorage.removeItem(key);}}/>;
  const discounted=(price:number,id:string)=>price*(1-(discounts[id]??0)/100);
  const total=draft.reduce((sum,i)=>sum+discounted(i.unitPrice,i.productId)*i.quantity,0);
  return <><section className={`${s.card} ${s.draft}`}><div className={s.titleLine}><h2>Current order</h2><span className={s.muted}>{draft.reduce((n,i)=>n+i.quantity,0)} units</span></div>{draft.length?<div className={s.tableWrap}><table className={s.table}><thead><tr><th>Product / denomination</th><th>Quantity</th><th>Estimated total</th><th/></tr></thead><tbody>{draft.map(i=><tr key={draftKey(i)}><td className={s.itemName}>{i.productName}<p className={s.muted}>{i.editionName}</p></td><td>{i.quantity}</td><td className={s.money}>{usd(discounted(i.unitPrice,i.productId)*i.quantity)}</td><td><button className={s.button} disabled={busy} onClick={()=>{try{save(draft.filter(d=>draftKey(d)!==draftKey(i)));}catch{setError("Unable to update the saved draft.");}}}>Remove</button></td></tr>)}</tbody></table></div>:<div className={s.empty}>{ready?"Choose products below to build your order.":"Loading your saved draft…"}</div>}<div className={s.draftTotal}><div className={s.actions}><button className={s.button} disabled={!ready||busy||!draft.length} onClick={()=>{try{save(draft);setMessage("Draft saved on this browser.");}catch{setError("Unable to save your draft.");}}}>Save draft</button><button className={s.button} disabled={busy||!draft.length} onClick={()=>{try{save([]);setMessage("Draft cleared.");}catch{setError("Unable to clear the draft.");}}}>Clear draft</button></div><div className={s.actions}><strong>{usd(total)}</strong><button className={s.primary} onClick={proceed} disabled={!ready||busy||!draft.length}>{busy?"Checking stock…":"Proceed →"}</button></div></div><p className={s.helper}>Drafts are saved in this browser. Prices include your assigned customer discount; final prices and purchase limits are confirmed at checkout.</p></section>{error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}{message&&<p role="status" className={s.notice}>{message}</p>}{filters}<p className={s.scrollHint}>Swipe across the table to see prices and order quantities →</p>{stockError&&<p role="alert" className={`${s.notice} ${s.error}`}>{stockError} Refresh this page to retry.</p>}<div className={s.tableWrap}><table className={s.table}><thead><tr><th>Product</th><th>Region</th><th>Card value / option</th><th>Stock</th><th>Price (USD)</th><th>Discount</th><th>Quantity</th><th/></tr></thead><tbody>{products.flatMap(product=>product.product_options.filter(o=>o.is_active).slice().sort((a,b)=>Number(ranges.some(r=>r.option_id===b.id))-Number(ranges.some(r=>r.option_id===a.id))).map(option=>{
    const range=ranges.find(r=>r.enabled&&r.option_id===option.id);
    const limit=limits[option.id], min=Math.max(product.minimum_quantity??1,option.minimum_quantity??1,1), configure=product.product_customer_fields.length>0||product.allows_player_id_topup||product.product_type==="GAME_TOPUP"||(option.is_custom_value&&!range);
    const available=limit?.availableQuantity, unavailable=option.is_in_stock===false||available===0||(range&&range.delivery_mode!=="MANUAL");
    let rangeUnit:number|null=null;try{if(range&&amounts[option.id])rangeUnit=rangePrice(range,Number(amounts[option.id]));}catch{}
    return <tr key={option.id} className={range?s.rangeRow:undefined}><td><div className={s.product}>{product.image_url&& /* Catalogue images may be supplied by external brands. */ <Image className={s.thumb} src={product.image_url} alt="" width={46} height={38} unoptimized/>}<Link className={s.itemName} href={`/product/${product.slug}`}>{product.name}</Link></div></td><td>{product.region||"Global"}</td><td>{range?<div className={s.rangeValue}><input aria-label={`Card value for ${product.name}`} type="number" min={range.minimum} max={range.maximum} step={range.step} placeholder={`${range.minimum}–${range.maximum}`} value={amounts[option.id]??""} onChange={e=>setAmounts({...amounts,[option.id]:e.target.value})}/><span>{range.currency}</span></div>:option.option_name||`${option.denomination??"Custom"} ${product.currency}`}</td><td><span className={`${s.badge} ${unavailable?s.cancelled:""}`}>{unavailable?"Out of stock":!limit?"Checking…":available===null?"Available":available.toLocaleString()}</span></td><td className={s.money}>{range?(rangeUnit===null?"—":usd(discounted(rangeUnit,product.id))):option.is_custom_value?"Custom":usd(discounted(Number(option.selling_price),product.id))}</td><td>{discounts[product.id]?`${discounts[product.id]}%`:"—"}</td><td>{!configure&&<div className={s.quantityControl}><button type="button" aria-label={`Decrease quantity for ${product.name} ${option.option_name}`} disabled={Number(quantities[option.id]??min)<=min} onClick={()=>setQuantities({...quantities,[option.id]:String(Math.max(min,(Number(quantities[option.id])||min)-1))})}>−</button><input className={s.qty} aria-label={`Quantity for ${product.name} ${option.option_name}`} type="number" min={min} max={limit?.maximumQuantity??undefined} step={1} value={quantities[option.id]??String(min)} onChange={e=>setQuantities({...quantities,[option.id]:e.target.value})}/><button type="button" aria-label={`Increase quantity for ${product.name} ${option.option_name}`} disabled={limit?.maximumQuantity!=null&&Number(quantities[option.id]??min)>=limit.maximumQuantity} onClick={()=>setQuantities({...quantities,[option.id]:String((Number(quantities[option.id])||min)+1)})}>+</button></div>}</td><td>{configure?<span className={s.muted}>Delivery details required</span>:<button className={s.primary} disabled={!ready||busy||!limit||unavailable} onClick={()=>add(product,option,range)}>Add</button>}</td></tr>;
  }))}</tbody></table>{!products.length&&<div className={s.empty}>No products match your filters.</div>}</div><p className={s.helper}>Enter a card value within the range, choose quantity, and click Add. Products requiring extra delivery details cannot be ordered from this quick-order table. Stock is checked again when you continue.</p></>;
}
