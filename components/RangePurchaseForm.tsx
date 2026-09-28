"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {rangePrice,type ProductRange} from "@/lib/product-range";
import {validateCartStock} from "@/lib/cart-stock";
type Field={id:string;label:string;field_type:string;is_required:boolean;placeholder?:string|null};
type RangeProduct={id:string;name:string;slug:string;image_url?:string|null;minimum_quantity:number;maximum_quantity:number|null;is_bulk_order:boolean};
export default function RangePurchaseForm({range,product,discountPercent=0,affiliatePercent=0,fields=[]}:{fields?:Field[];affiliatePercent?:number;range:ProductRange;product:RangeProduct;discountPercent?:number}){
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const router=useRouter(),lock=useRef(false);
 const [value,setValue]=useState(String(range.minimum)),[quantity,setQuantity]=useState(String(Math.max(1,product.minimum_quantity))),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const markedPrice=(price:number)=>Math.round((price+Math.round(price*Math.max(0,affiliatePercent))/100)*100)/100;
 let price=0;try{price=markedPrice(rangePrice(range,Number(value)));}catch{}
 const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
 async function purchase(buyNow:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
  try{
   const amount=Number(value),count=Number(quantity),unitPrice=markedPrice(rangePrice(range,amount));
   if(!Number.isSafeInteger(count)||count<Math.max(1,product.minimum_quantity)||(!product.is_bulk_order&&product.maximum_quantity!==null&&count>product.maximum_quantity))throw Error("Enter a quantity within this product’s purchase limits.");
   if(fields.length&&count>30)throw Error("Use up to 30 codes per order when delivery details are required.");
   const information=(index:number)=>fields.map(field=>{const answer=(answers[`${index}:${field.id}`]??"").trim();if((field.is_required&&!answer)||answer.length>500)throw Error(`Enter ${field.label} for code ${index+1}.`);if(answer&&field.field_type==="EMAIL"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer))throw Error(`Enter a valid ${field.label}.`);if(answer&&field.field_type==="NUMBER"&&!/^-?[0-9]+([.][0-9]+)?$/.test(answer))throw Error(`Enter a valid ${field.label}.`);return {fieldId:field.id,label:field.label,value:answer};}).filter(f=>f.value);
   const id=`range-${range.option_id}-${Date.now()}`;
   const item={id,cartId:id,productId:product.id,productOptionId:range.option_id,slug:product.slug,productName:product.name,name:product.name,title:product.name,editionName:`${amount} ${range.currency}`,denomination:amount,amount,customValue:amount,image:product.image_url,quantity:count,unitPrice,price:unitPrice,totalPrice:unitPrice*count,minQuantity:Math.max(1,product.minimum_quantity),maxQuantity:product.is_bulk_order?undefined:product.maximum_quantity??undefined,isBulkOrder:product.is_bulk_order,deliveryType:"MANUAL",customerInformation:[]};
   const items=fields.length?Array.from({length:count},(_,index)=>({...item,id:`${id}-${index}`,cartId:`${id}-${index}`,quantity:1,totalPrice:unitPrice,customerInformation:information(index)})):[item];
   if(buyNow){await validateCartStock(items);localStorage.setItem("buyNowItem",JSON.stringify(items.length===1?items[0]:items));router.push("/checkout");}
   else{const cart=JSON.parse(localStorage.getItem("shoppingCart")??"[]");if(!Array.isArray(cart))throw Error("Please review your existing cart first.");await validateCartStock([...cart,...items]);localStorage.setItem("shoppingCart",JSON.stringify([...cart,...items]));window.dispatchEvent(new Event("cartUpdated"));setMessage("Added to cart.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to add this denomination.");}finally{lock.current=false;setBusy(false);}
 }
 if(!range.enabled)return null;
 return <section className="my-4 rounded-xl border border-cyan-200 bg-white p-4 text-slate-900" aria-label={`Range purchase for ${product.name}`}>
  <h3 className="font-bold">{product.name} — choose your denomination</h3>
  <p className="mt-1 text-sm text-slate-600">{range.minimum}–{range.maximum} {range.currency} per code · increments of {range.step}</p>
  <div className="mt-3 flex flex-wrap items-end gap-3">
   <label className="text-sm">Denomination ({range.currency})<input className="mt-1 block w-40 rounded border border-slate-300 px-3 py-2" aria-label={`Denomination for ${product.name}`} type="number" min={range.minimum} max={range.maximum} step={range.step} value={value} onChange={e=>{setValue(e.target.value);setError("");}}/></label>
   <label className="text-sm">Quantity<input className="mt-1 block w-24 rounded border border-slate-300 px-3 py-2" aria-label={`Range quantity for ${product.name}`} type="number" min={Math.max(1,product.minimum_quantity)} max={product.is_bulk_order?undefined:product.maximum_quantity??undefined} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <div className="text-sm"><strong>{money(price*(1-discountPercent/100))} / code</strong><p>Total: {money(price*(1-discountPercent/100)*(Number(quantity)||0))}</p></div>
   <button type="button" disabled={busy} className="rounded-lg border border-blue-600 px-4 py-2 font-bold text-blue-600 disabled:opacity-50" onClick={()=>purchase(false)}>Add to cart</button>
   <button type="button" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50" onClick={()=>purchase(true)}>Buy now</button>
  </div>
  {fields.length>0&&Array.from({length:Math.min(30,Math.max(1,Number(quantity)||1))},(_,index)=><div key={index} className="mt-3 grid gap-2"><p className="font-bold">Code {index+1} details</p>{fields.map(field=><label key={field.id} className="text-sm">{field.label}{field.is_required?" *":""}<input className="mt-1 block w-full rounded border px-3 py-2" maxLength={500} placeholder={field.placeholder??""} value={answers[`${index}:${field.id}`]??""} onChange={e=>setAnswers({...answers,[`${index}:${field.id}`]:e.target.value})}/></label>)}</div>)}
  {range.delivery_mode==="MANUAL"&&<p className="mt-2 text-xs text-slate-500">Codes are delivered by our team after payment.</p>}
  {error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}{message&&<p role="status" className="mt-2 text-sm text-green-700">{message}</p>}
 </section>;
}
