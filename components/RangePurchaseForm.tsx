"use client";
import {isSensitiveCustomerField} from "@/lib/sensitive-customer-fields";
import {captureProtectedDetails,ACCOUNT_PURCHASE_CONSENT} from "@/lib/protected-detail-client";
import {useRef,useState} from "react";
import styles from "./RangePurchaseForm.module.css";
import LocalizedProductImage from "@/components/LocalizedProductImage";
import {useStorePreferences} from "@/components/StorePreferences";
import {useRouter} from "next/navigation";
import {rangePrice,type ProductRange} from "@/lib/product-range";
import {validateCartStock} from "@/lib/cart-stock";
import {activePromotion,discountedPrice,extraCustomerPercent,promotionExpiryLabel,type PromotionRule} from "@/lib/product-promotions";
import {usePromotionClock} from "@/components/usePromotionClock";
type Field={id:string;label:string;field_type:string;is_required:boolean;placeholder?:string|null};
type RangeProduct={id:string;name:string;slug:string;image_url?:string|null;image_url_ru?:string|null;name_ru?:string|null;minimum_quantity:number;maximum_quantity:number|null;is_bulk_order:boolean};
export default function RangePurchaseForm({range,product,discountPercent=0,affiliatePercent=0,fields=[],promotionRules=[]}:{fields?:Field[];affiliatePercent?:number;range:ProductRange;product:RangeProduct;discountPercent?:number;promotionRules?:PromotionRule[]}){
 const promotionNow=usePromotionClock(promotionRules.map(r=>r.endsAt));
 const sale=activePromotion(promotionRules,range.option_id,promotionNow);
 const personalPercent=extraCustomerPercent(sale?.percent??0,discountPercent);
 const protectedFields=fields.filter(field=>isSensitiveCustomerField(field.label));
 const [accountAuthorized,setAccountAuthorized]=useState(false);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const router=useRouter(),lock=useRef(false);
 const [value,setValue]=useState(""),[quantity,setQuantity]=useState(String(Math.max(1,product.minimum_quantity))),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const markedPrice=(price:number)=>Math.round((price+Math.round(price*Math.max(0,affiliatePercent))/100)*100)/100;
 let price:number|null=null;let regular:number|null=null;try{if(value.trim()){regular=markedPrice(rangePrice(range,Number(value)));price=markedPrice(discountedPrice(rangePrice(range,Number(value)),sale?.percent??0));}}catch{}
 const {formatPrice:money}=useStorePreferences();
 let currencySymbol=range.currency;
 try{currencySymbol=new Intl.NumberFormat("en-US",{style:"currency",currency:range.currency,currencyDisplay:"narrowSymbol"}).formatToParts(0).find(part=>part.type==="currency")?.value??range.currency;}catch{}
 const rangePlaceholder=`${range.minimum}${currencySymbol}-${range.maximum}${currencySymbol}`;
 async function purchase(buyNow:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
  try{
   if(!value.trim())throw Error(`Enter a denomination from ${range.minimum} to ${range.maximum} ${range.currency}.`);
   const amount=Number(value),count=Number(quantity),expectedSaleUnitPrice=discountedPrice(rangePrice(range,amount),activePromotion(promotionRules,range.option_id)?.percent??0),unitPrice=markedPrice(expectedSaleUnitPrice);
   if(!Number.isSafeInteger(count)||count<Math.max(1,product.minimum_quantity)||(!product.is_bulk_order&&product.maximum_quantity!==null&&count>product.maximum_quantity))throw Error("Enter a quantity within this product’s purchase limits.");
   if(fields.length&&count>30)throw Error("Use up to 30 codes per order when delivery details are required.");
   if(protectedFields.length&&!accountAuthorized)throw Error("Confirm that you own the account and authorize this purchase.");
   if(protectedFields.length&&count>20)throw Error("Maximum 20 accounts per checkout.");
   let references:Record<string,string>[]=[];
   const information=(index:number)=>fields.map(field=>{const answer=(answers[`${index}:${field.id}`]??"").trim();if((field.is_required&&!answer)||answer.length>500)throw Error(`Enter ${field.label} for code ${index+1}.`);if(answer&&field.field_type==="EMAIL"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer))throw Error(`Enter a valid ${field.label}.`);if(answer&&field.field_type==="NUMBER"&&!/^-?[0-9]+([.][0-9]+)?$/.test(answer))throw Error(`Enter a valid ${field.label}.`);return {fieldId:field.id,label:field.label,value:isSensitiveCustomerField(field.label)?(references[index]?.[field.id]??""):answer};}).filter(f=>f.value);
   if(protectedFields.length){
    for(let index=0;index<count;index++)information(index);
    const units=Array.from({length:count},(_,index)=>Object.fromEntries(protectedFields.map(field=>[field.id,answers[`${index}:${field.id}`]??""])));
    references=await captureProtectedDetails(product.id,accountAuthorized,units);
   }
   const id=`range-${range.option_id}-${Date.now()}`;
   const item={id,cartId:id,productId:product.id,productOptionId:range.option_id,slug:product.slug,productName:product.name,name:product.name,title:product.name,editionName:`${amount} ${range.currency}`,denomination:amount,denominationCurrency:range.currency,amount,customValue:amount,image:product.image_url,quantity:count,unitPrice,price:unitPrice,totalPrice:unitPrice*count,minQuantity:Math.max(1,product.minimum_quantity),maxQuantity:product.is_bulk_order?undefined:product.maximum_quantity??undefined,isBulkOrder:product.is_bulk_order,deliveryType:range.delivery_mode==="MANUAL"?"MANUAL":"AUTOMATIC",customerInformation:[]};
   const pricedItem={...item,salePercent:activePromotion(promotionRules,range.option_id)?.percent??0,expectedSaleUnitPrice};
   const items=fields.length?Array.from({length:count},(_,index)=>({...pricedItem,id:`${id}-${index}`,cartId:`${id}-${index}`,quantity:1,totalPrice:unitPrice,customerInformation:information(index)})):[pricedItem];
   if(buyNow){await validateCartStock(items);localStorage.setItem("buyNowItem",JSON.stringify(items.length===1?items[0]:items));router.push("/checkout");}
   else{const cart=JSON.parse(localStorage.getItem("shoppingCart")??"[]");if(!Array.isArray(cart))throw Error("Please review your existing cart first.");await validateCartStock([...cart,...items]);localStorage.setItem("shoppingCart",JSON.stringify([...cart,...items]));window.dispatchEvent(new Event("cartUpdated"));setMessage("Added to cart.");}
   if(protectedFields.length){setAnswers(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!protectedFields.some(field=>key.endsWith(":"+field.id)))));setAccountAuthorized(false);}
  }catch(e){setError(e instanceof Error?e.message:"Unable to add this denomination.");}finally{lock.current=false;setBusy(false);}
 }
 if(!range.enabled)return null;
 return <section className={styles.form} aria-label={`Range purchase for ${product.name}`}>
  <div className={styles.controls}>
   <LocalizedProductImage imageUrl={product.image_url??null} imageUrlRu={product.image_url_ru} alt={product.name} altRu={product.name_ru} className={styles.productIcon} fallback={<span className={styles.productIconFallback} aria-hidden="true">{product.name.charAt(0).toUpperCase()}</span>}/>
   <label className={styles.label}>Denomination ({range.currency})<input className={styles.denomination} aria-label={`Denomination for ${product.name}`} type="number" inputMode="decimal" placeholder={rangePlaceholder} title={`Allowed range: ${range.minimum}–${range.maximum} ${range.currency}; increments of ${range.step}`} min={range.minimum} max={range.maximum} step={range.step} value={value} onChange={e=>{setValue(e.target.value);setError("");}}/></label>
   <label className={styles.label}>Quantity<input className={styles.quantity} aria-label={`Range quantity for ${product.name}`} type="number" min={Math.max(1,product.minimum_quantity)} max={product.is_bulk_order?undefined:product.maximum_quantity??undefined} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <div className={styles.price} aria-live="polite"><strong>{price===null?"—":money(price-Math.round(price*personalPercent)/100)} / code</strong>{sale&&regular!==null&&<del>{money(regular)}</del>}<p>Total: {price===null?"—":money(price*(Number(quantity)||0)-Math.round(price*(Number(quantity)||0)*personalPercent)/100)}</p></div>
   <button type="button" disabled={busy} className={styles.addButton} onClick={()=>purchase(false)}>Add to cart</button>
   <button type="button" disabled={busy} className={styles.buyButton} onClick={()=>purchase(true)}>Buy now</button>
  </div>
  <p className={styles.hint}>Manual Delivery will take Few Minutes.</p>
  {sale&&sale.percent>=discountPercent&&<p className={styles.hint}>Save {sale.percent}% · Ends {promotionExpiryLabel(sale.endsAt!)}</p>}
  {range.step>1&&<p className={styles.hint}>Increments of {range.step} {range.currency}</p>}
  {fields.length>0&&Array.from({length:Math.min(30,Math.max(1,Number(quantity)||1))},(_,index)=><div key={index} className="mt-3 grid gap-2"><p className="font-bold">Code {index+1} details</p>{fields.map(field=><label key={field.id} className={styles.label}>{field.label}{field.is_required?" *":""}<input className={styles.detailInput} type={isSensitiveCustomerField(field.label)?"password":field.field_type==="EMAIL"?"email":"text"} autoComplete={isSensitiveCustomerField(field.label)?"off":undefined} spellCheck={isSensitiveCustomerField(field.label)?false:undefined} maxLength={500} placeholder={field.placeholder??""} value={answers[`${index}:${field.id}`]??""} onChange={e=>setAnswers({...answers,[`${index}:${field.id}`]:e.target.value})}/></label>)}</div>)}
  {protectedFields.length>0&&<label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-300 p-4 text-sm"><input type="checkbox" required checked={accountAuthorized} onChange={e=>setAccountAuthorized(e.target.checked)} className="mt-1"/><span>{ACCOUNT_PURCHASE_CONSENT}</span></label>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
 </section>;
}
