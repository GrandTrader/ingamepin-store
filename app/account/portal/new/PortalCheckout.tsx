"use client";
import { formatFaceValue, quoteFaceItem, type FaceValueDraft } from "@/lib/face-value";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {usd} from "@/lib/business-portal";
import type {PortalQuote,PortalCheckoutInput} from "@/lib/portal-checkout";
import s from "../Portal.module.css";
type Item=FaceValueDraft & {productOptionId:string;quantity:number;customValue?:number};
type Attempt={requestId:string;items:Item[];reference:string;expectedTotal:number;quote:PortalQuote};
export default function PortalCheckout({userId,items,onBack,onComplete}:{userId:string;items:Item[];onBack:()=>void;onComplete:()=>void}){
 const router=useRouter(),key="business-order-confirm:"+userId,lock=useRef(false);
 const [quote,setQuote]=useState<PortalQuote|null>(null),[receipt,setReceipt]=useState<PortalQuote|null>(null),[reference,setReference]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(true),[pending,setPending]=useState<Attempt|null>(null);
 const requestId=useRef("");
 const [reviewAttempt,setReviewAttempt]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();let timeout:ReturnType<typeof setTimeout>|undefined;
  async function preview(){try{
   const saved=localStorage.getItem(key);
   if(saved){const attempt=JSON.parse(saved) as Attempt;if(!attempt.requestId||!attempt.quote||!Array.isArray(attempt.items))throw Error("Unable to restore this confirmation. Check order history before placing another order.");if(active){setPending(attempt);setReference(attempt.reference);setQuote(attempt.quote);requestId.current=attempt.requestId;}return;}
   requestId.current=crypto.randomUUID();
   // Only the read-only quote can time out. Submitted payments keep their existing recovery flow.
   timeout=setTimeout(()=>{if(active){active=false;controller.abort();setError("The order check is taking longer than expected. Your draft is saved and no payment was submitted. Try checking again.");setBusy(false);}},20000);
   const response=await fetch("/api/account/portal/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"quote",paymentMethod:"wallet",requestId:requestId.current,items}),signal:controller.signal});const data=await response.json();
   if(!response.ok||!data.result)throw Error(data.error??"Unable to review this order.");if(active)setQuote(data.result);
  }catch(e){if(active)setError(e instanceof Error?e.message:"Unable to review this order.");}finally{clearTimeout(timeout);if(active)setBusy(false);}}
  void preview();return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[key,items,reviewAttempt]);
 async function confirm(){
  if(lock.current||!quote)return;lock.current=true;setBusy(true);setError("");
  const attempt=pending??{requestId:requestId.current,items,reference:reference.trim(),expectedTotal:Number(quote.total),quote};
  try{
   // Persist before sending: retries after a lost response reuse exactly the same request and order.
   localStorage.setItem(key,JSON.stringify(attempt));setPending(attempt);
   const payload:Partial<PortalCheckoutInput>&{paymentMethod:string}={action:"confirm",paymentMethod:"wallet",requestId:attempt.requestId,items:attempt.items,reference:attempt.reference,expectedTotal:attempt.expectedTotal};
   const response=await fetch("/api/account/portal/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();
   if(!response.ok||!data.result?.orderId){if(response.status===400||response.status===409){localStorage.removeItem(key);setPending(null);}throw Error(data.error??"Confirmation is uncertain. Retry this same confirmation to check its status.");}
   setReceipt(data.result);localStorage.removeItem(key);onComplete();router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Connection interrupted. Retry this same confirmation to check its status.");}finally{lock.current=false;setBusy(false);}
 }
 const faceItems=quote?.items.map(item=>quoteFaceItem(item,pending?.items??items))??[];
 if(receipt)return <section className={s.card}><h2 className={s.sectionTitle}>Order confirmed</h2><p>Order {receipt.orderNumber} · {receipt.status}</p><p className={s.notice}>{usd(receipt.total)} paid from your iNgamePIN wallet. Balance after payment: {usd(receipt.balanceAfter)}.</p><div className={s.actions}><Link className={s.primary} href="/account/portal">Order history</Link><Link className={s.button} href={`/account/portal/orders/${receipt.orderId}`}>View order</Link></div></section>;
 return <section className={s.card} aria-label="Confirm B2B order"><div className={s.titleLine}><h2>Confirm order</h2><span className={s.badge}>iNgamePIN wallet only</span></div>
  {busy&&!quote&&<p role="status">Checking prices, stock and wallet balance…</p>}
  {quote&&<><label className={s.reference}>Your order reference (optional)<input maxLength={160} value={reference} disabled={busy||!!pending} onChange={e=>setReference(e.target.value)}/></label><div className={s.tableWrap}><table className={`${s.table} ${s.mobileTable}`}><thead><tr><th>Product</th><th>Card value</th><th>Unit price</th><th>Quantity</th><th>Face value</th><th>Line total</th></tr></thead><tbody>{quote.items.map((i,index)=><tr key={index}><td data-label="Product">{i.productName}</td><td data-label="Card value">{i.optionName}</td><td data-label="Unit price">{usd(i.unitPrice)}</td><td data-label="Quantity">{i.quantity}</td><td data-label="Face value">{formatFaceValue([faceItems[index]])}</td><td data-label="Line total" className={s.money}>{usd(i.lineTotal)}</td></tr>)}</tbody></table></div><div className={s.checkoutSummary}><p>Wallet payment fee <strong>{usd(quote.fee)}</strong></p><p>Face value <strong>{formatFaceValue(faceItems)}</strong></p><p>Total <strong>{usd(quote.total)}</strong></p><p>Wallet balance <strong>{usd(quote.walletBalance)}</strong></p><p>Balance after payment <strong>{usd(quote.balanceAfter)}</strong></p></div>
  {Number(quote.balanceAfter)<0&&<p className={`${s.notice} ${s.error}`}>Insufficient wallet balance. <Link href="/account/portal/wallet">Add funds to your wallet</Link> before confirming.</p>}
  <p className={s.helper}>Confirmation deducts the total from your wallet and places the order. Delivery follows each product’s delivery time.</p></>}
  {pending&&<p className={s.notice}>A confirmation was submitted. Retry it here to retrieve the result without creating another order.</p>}
  {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}
  <div className={s.draftTotal}><div className={s.actions}><Link className={s.button} href="/account/portal">Order history</Link><button className={s.button} disabled={(busy&&!!quote)||!!pending} onClick={onBack}>Edit order</button></div>{!busy&&!quote&&<button className={s.primary} onClick={()=>{setError("");setBusy(true);setReviewAttempt(n=>n+1);}}>Retry order check</button>}<button className={s.primary} disabled={busy||!quote||(Number(quote.balanceAfter)<0&&!pending)} onClick={confirm}>{busy?(quote?"Confirming...":"Checking order..."):pending?"Retry confirmation":"Confirm & pay from wallet"}</button></div>
 </section>;
}
