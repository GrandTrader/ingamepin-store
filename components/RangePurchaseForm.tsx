"use client";
import {useRef,useState} from "react";
import styles from "./RangePurchaseForm.module.css";
import LocalizedProductImage from "@/components/LocalizedProductImage";
import {useStorePreferences} from "@/components/StorePreferences";
import {useRouter} from "next/navigation";
import {rangePrice,type ProductRange} from "@/lib/product-range";
import {validateCartStock} from "@/lib/cart-stock";
type Field={id:string;label:string;field_type:string;is_required:boolean;placeholder?:string|null};
type RangeProduct={id:string;name:string;slug:string;image_url?:string|null;image_url_ru?:string|null;name_ru?:string|null;minimum_quantity:number;maximum_quantity:number|null;is_bulk_order:boolean};
export default function RangePurchaseForm({range,product,discountPercent=0,affiliatePercent=0,fields=[]}:{fields?:Field[];affiliatePercent?:number;range:ProductRange;product:RangeProduct;discountPercent?:number}){
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const router=useRouter(),lock=useRef(false);
 const [value,setValue]=useState(""),[quantity,setQuantity]=useState(String(Math.max(1,product.minimum_quantity))),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const markedPrice=(price:number)=>Math.round((price+Math.round(price*Math.max(0,affiliatePercent))/100)*100)/100;
 let price:number|null=null;try{if(value.trim())price=markedPrice(rangePrice(range,Number(value)));}catch{}
 const {formatPrice:money}=useStorePreferences();
 async function purchase(buyNow:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
  try{
   if(!value.trim())throw Error(`Enter a denomination from ${range.minimum} to ${range.maximum} ${range.currency}.`);
   const amount=Number(value),count=Number(quantity),unitPrice=markedPrice(rangePrice(range,amount));
   if(!Number.isSafeInteger(count)||count<Math.max(1,product.minimum_quantity)||(!product.is_bulk_order&&product.maximum_quantity!==null&&count>product.maximum_quantity))throw Error("Enter a quantity within this product’s purchase limits.");
   if(fields.length&&count>30)throw Error("Use up to 30 codes per order when delivery details are required.");
   const information=(index:number)=>fields.map(field=>{const answer=(answers[`${index}:${field.id}`]??"").trim();if((field.is_required&&!answer)||answer.length>500)throw Error(`Enter ${field.label} for code ${index+1}.`);if(answer&&field.field_type==="EMAIL"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer))throw Error(`Enter a valid ${field.label}.`);if(answer&&field.field_type==="NUMBER"&&!/^-?[0-9]+([.][0-9]+)?$/.test(answer))throw Error(`Enter a valid ${field.label}.`);return {fieldId:field.id,label:field.label,value:answer};}).filter(f=>f.value);
   const id=`range-${range.option_id}-${Date.now()}`;
   const item={id,cartId:id,productId:product.id,productOptionId:range.option_id,slug:product.slug,productName:product.name,name:product.name,title:product.name,editionName:`${amount} ${range.currency}`,denomination:amount,denominationCurrency:range.currency,amount,customValue:amount,image:product.image_url,quantity:count,unitPrice,price:unitPrice,totalPrice:unitPrice*count,minQuantity:Math.max(1,product.minimum_quantity),maxQuantity:product.is_bulk_order?undefined:product.maximum_quantity??undefined,isBulkOrder:product.is_bulk_order,deliveryType:range.delivery_mode==="MANUAL"?"MANUAL":"AUTOMATIC",customerInformation:[]};
   const items=fields.length?Array.from({length:count},(_,index)=>({...item,id:`${id}-${index}`,cartId:`${id}-${index}`,quantity:1,totalPrice:unitPrice,customerInformation:information(index)})):[item];
   if(buyNow){await validateCartStock(items);localStorage.setItem("buyNowItem",JSON.stringify(items.length===1?items[0]:items));router.push("/checkout");}
   else{const cart=JSON.parse(localStorage.getItem("shoppingCart")??"[]");if(!Array.isArray(cart))throw Error("Please review your existing cart first.");await validateCartStock([...cart,...items]);localStorage.setItem("shoppingCart",JSON.stringify([...cart,...items]));window.dispatchEvent(new Event("cartUpdated"));setMessage("Added to cart.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to add this denomination.");}finally{lock.current=false;setBusy(false);}
 }
 if(!range.enabled)return null;
 return <section className={styles.form} aria-label={`Range purchase for ${product.name}`}>
  <div className={styles.controls}>
   <LocalizedProductImage imageUrl={product.image_url??null} imageUrlRu={product.image_url_ru} alt={product.name} altRu={product.name_ru} className={styles.productIcon} fallback={<span className={styles.productIconFallback} aria-hidden="true">{product.name.charAt(0).toUpperCase()}</span>}/>
   <label className={styles.label}>Denomination ({range.currency})<input className={styles.denomination} aria-label={`Denomination for ${product.name}`} type="number" inputMode="decimal" placeholder={`${range.minimum}–${range.maximum}`} title={`Allowed range: ${range.minimum}–${range.maximum} ${range.currency}; increments of ${range.step}`} min={range.minimum} max={range.maximum} step={range.step} value={value} onChange={e=>{setValue(e.target.value);setError("");}}/></label>
   <label className={styles.label}>Quantity<input className={styles.quantity} aria-label={`Range quantity for ${product.name}`} type="number" min={Math.max(1,product.minimum_quantity)} max={product.is_bulk_order?undefined:product.maximum_quantity??undefined} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <div className={styles.price} aria-live="polite"><strong>{price===null?"—":money(price*(1-discountPercent/100))} / code</strong><p>Total: {price===null?"—":money(price*(1-discountPercent/100)*(Number(quantity)||0))}</p></div>
   <button type="button" disabled={busy} className={styles.addButton} onClick={()=>purchase(false)}>Add to cart</button>
   <button type="button" disabled={busy} className={styles.buyButton} onClick={()=>purchase(true)}>Buy now</button>
  </div>
  {range.delivery_mode==="MANUAL"&&<p className={styles.hint}>Delivered manually after payment.</p>}
  {range.delivery_mode==="SUPPLIER"&&<p className={styles.hint}>Supplier delivery after payment. Codes may take a few minutes.</p>}
  {range.step>1&&<p className={styles.hint}>Increments of {range.step} {range.currency}</p>}
  {fields.length>0&&Array.from({length:Math.min(30,Math.max(1,Number(quantity)||1))},(_,index)=><div key={index} className="mt-3 grid gap-2"><p className="font-bold">Code {index+1} details</p>{fields.map(field=><label key={field.id} className={styles.label}>{field.label}{field.is_required?" *":""}<input className={styles.detailInput} maxLength={500} placeholder={field.placeholder??""} value={answers[`${index}:${field.id}`]??""} onChange={e=>setAnswers({...answers,[`${index}:${field.id}`]:e.target.value})}/></label>)}</div>)}
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
 </section>;
}
