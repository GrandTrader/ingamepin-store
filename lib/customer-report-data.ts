import "server-only";
import { normalizeCustomerDeviceDetails, type CustomerDeviceDetails } from "./customer-device-details";
import type { createAdminClient } from "@/lib/supabase/admin";
import { WalletSummaryAccumulator, emptyWalletPeriodSummary, type WalletPeriodSummary } from "@/lib/wallet-activity-summary";

type DB = ReturnType<typeof createAdminClient>;
type Money = number | string;
type Row = { id: string; created_at: string };
export type ReportTransaction = Row & { user_id:string; transaction_type:string; amount:Money; balance_before:Money|null; balance_after:Money|null; description:string|null; reference_id:string|null; order_id:string|null };
export type ReportTopup = Row & { amount:Money; currency:string; payment_method:string; payment_reference:string|null; status:string; gateway_order_id:string|null; gateway_transaction_id:string|null; paid_at:string|null; reviewed_at:string|null };
export type ReportPayment = Row & { order_id:string; method:string; status:string; amount:Money; currency:string; transaction_id:string|null; gateway_order_id:string|null; gateway_payment_id:string|null; verified_at:string|null };
export type ReportItem = Row & { order_id:string; product_name:string; option_name:string|null; denomination:Money|null; custom_value:Money|null; platform:string|null; quantity:number; unit_price:Money; total_price:Money; service_delivered_at:string|null; products:{slug:string;region:string|null}|null; product_options:{denomination_currency:string|null}|null; deliveredCodes:number; refunds:{quantity:number;amount:Money;status:string}[] };
export type ReportLoginEvent = Row & { browser_id?:string|null; device_details?:CustomerDeviceDetails|null; ip_address:string|null; country_code:string|null; region:string|null; city:string|null; user_agent:string|null; event_type:string; source:"WEBSITE"|"AUTH_AUDIT"|"AUTH_SESSION" };
export type ReportOrder = Row & { customer_ip:string|null; order_number:string; customer_id:string|null; customer_email:string; currency:string; subtotal:Money; discount:Money; total:Money; status:string; paid_at:string|null; delivered_at:string|null; items:ReportItem[]; payments:ReportPayment[]; identityMatch:"account"|"wallet"|"guest-email" };
export type CustomerReport = {
 generatedAt:string; timeZone:string;
 customer:{id:string;name:string;email:string;phone:string;telegram:string;registeredAt:string;lastSignIn:string|null;latestActivity:string|null;emailVerified:boolean;phoneVerified:boolean;country:string|null};
 wallet:{currency:string;balance:Money;balanceReadAt:string;summary:WalletPeriodSummary;reconciled:boolean};
 network:{deviceStatus?:"available"|"setup-required";status:"available"|"setup-required";events:ReportLoginEvent[];countryHistory:{created_at:string;countryCode:string}[]};
 transactions:ReportTransaction[];topups:ReportTopup[];orders:ReportOrder[];
};
export const REPORT_TIME_ZONES = { "Asia/Kolkata":"India (IST, UTC+05:30)", "Europe/Moscow":"Moscow (MSK, UTC+03:00)", "UTC":"UTC" } as const;
export class CustomerReportError extends Error { constructor(message:string,readonly status=503){super(message);} }

// Seek through every page, even when PostgREST caps a response below the requested size.
export async function readReportRows<T extends Row>(fetchPage:(cursor:string)=>PromiseLike<{data:unknown[]|null;error:unknown}>,signal?:AbortSignal):Promise<T[]> {
 const rows:T[]=[];let cursor="id.not.is.null",previous="";
 while(true){
  signal?.throwIfAborted();const r=await fetchPage(cursor);
  if(r.error)throw new CustomerReportError("A report section could not be loaded. No partial report was generated.");
  const page=(r.data??[]) as T[];if(!page.length)return rows;
  const last=page[page.length-1];
  if(!/^[0-9a-f-]{36}$/i.test(last.id)||!Number.isFinite(Date.parse(last.created_at))||last.id===previous)throw new CustomerReportError("The report could not finish reading all records. Please retry.");
  rows.push(...page);previous=last.id;
  cursor=`created_at.gt.${last.created_at},and(created_at.eq.${last.created_at},id.gt.${last.id})`;
 }
}
const orderColumns="id,order_number,customer_id,customer_email,customer_ip,currency,subtotal,discount,total,status,paid_at,delivered_at,created_at";
const text=(value:unknown)=>typeof value==="string"?value:"";
export async function loadCustomerReport(db:DB,customerId:string,timeZone:string,signal?:AbortSignal):Promise<CustomerReport>{
 if(!Object.hasOwn(REPORT_TIME_ZONES,timeZone))throw new CustomerReportError("Choose a valid report time zone.",400);
 const auth=await db.auth.admin.getUserById(customerId);
 if(auth.error?.status===404||(!auth.error&&!auth.data.user))throw new CustomerReportError("Customer not found.",404);
 if(auth.error||!auth.data.user)throw new CustomerReportError("Customer details could not be loaded.");
 const person=auth.data.user,generatedAt=new Date().toISOString();
 const metadata=person.user_metadata??{},email=person.email??"";
 const [walletResult,loginResult,transactions,topups,accountOrders,guestOrders]=await Promise.all([
  db.from("customer_wallets").select("balance,currency,created_at,updated_at").eq("user_id",customerId).maybeSingle(),
  db.from("customer_login_activity").select("current_country_code,current_login_at,previous_country_code,previous_login_at").eq("user_id",customerId).maybeSingle(),
  readReportRows<ReportTransaction>(cursor=>db.from("wallet_transactions").select("id,user_id,transaction_type,amount,balance_before,balance_after,description,reference_id,order_id,created_at").eq("user_id",customerId).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
  readReportRows<ReportTopup>(cursor=>db.from("wallet_topup_requests").select("id,amount,currency,payment_method,payment_reference,status,gateway_order_id,gateway_transaction_id,paid_at,reviewed_at,created_at").eq("user_id",customerId).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
  readReportRows<ReportOrder>(cursor=>db.from("orders").select(orderColumns).eq("customer_id",customerId).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
  // Guest email matching is explicitly labelled, and never merges another registered account.
  email&&person.email_confirmed_at?readReportRows<ReportOrder>(cursor=>db.from("orders").select(orderColumns).is("customer_id",null).ilike("customer_email",email.replace(/[\\%_]/g,"\\$&")).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal):Promise.resolve([]),
 ]);
 if(walletResult.error||loginResult.error)throw new CustomerReportError("Customer wallet or sign-in details could not be loaded.");
 const orders=new Map<string,ReportOrder>();
 for(const o of guestOrders)orders.set(o.id,{...o,items:[],payments:[],identityMatch:"guest-email"});
 for(const o of accountOrders)orders.set(o.id,{...o,items:[],payments:[],identityMatch:"account"});
 const walletOrderIds=[...new Set(transactions.map(t=>t.order_id).filter((id):id is string=>!!id))];
 for(let offset=0;offset<walletOrderIds.length;offset+=100){
  const ids=walletOrderIds.slice(offset,offset+100).filter(id=>!orders.has(id));if(!ids.length)continue;
  const extra=await readReportRows<ReportOrder>(cursor=>db.from("orders").select(orderColumns).in("id",ids).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal);
  for(const o of extra)orders.set(o.id,{...o,items:[],payments:[],identityMatch:"wallet"});
 }
 const orderIds=[...orders.keys()],items:ReportItem[]=[];
 for(let offset=0;offset<orderIds.length;offset+=100){
  const ids=orderIds.slice(offset,offset+100);
  const [part,payments]=await Promise.all([
   readReportRows<ReportItem>(cursor=>db.from("order_items").select("id,order_id,product_name,option_name,denomination,custom_value,platform,quantity,unit_price,total_price,service_delivered_at,created_at,products(slug,region),product_options(denomination_currency)").in("order_id",ids).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
   readReportRows<ReportPayment>(cursor=>db.from("payments").select("id,order_id,method,status,amount,currency,transaction_id,gateway_order_id,gateway_payment_id,verified_at,created_at").in("order_id",ids).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
  ]);
  for(const item of part){item.deliveredCodes=0;item.refunds=[];items.push(item);orders.get(item.order_id)!.items.push(item);}
  for(const payment of payments)orders.get(payment.order_id)!.payments.push(payment);
 }
 const itemMap=new Map(items.map(i=>[i.id,i]));
 for(let offset=0;offset<items.length;offset+=100){
  const ids=items.slice(offset,offset+100).map(i=>i.id);
  const [codes,refunds]=await Promise.all([
   // Never read voucher contents, passwords or recipient credentials for a shareable report.
   readReportRows<Row&{order_item_id:string}>(cursor=>db.from("gift_card_codes").select("id,order_item_id,created_at").in("order_item_id",ids).eq("status","SOLD").lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
   readReportRows<Row&{order_item_id:string;quantity:number;amount:Money;status:string}>(cursor=>db.from("order_item_refunds").select("id,order_item_id,quantity,amount,status,created_at").in("order_item_id",ids).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500),signal),
  ]);
  for(const code of codes)itemMap.get(code.order_item_id)!.deliveredCodes++;
  for(const refund of refunds)itemMap.get(refund.order_item_id)!.refunds.push({quantity:refund.quantity,amount:refund.amount,status:refund.status});
 }
 const network:CustomerReport["network"]={status:"available",events:[],countryHistory:[]};
 for(const source of ["WEBSITE","AUTH_AUDIT","AUTH_SESSION"] as const){
  let missing=false;
  const events=await readReportRows<Omit<ReportLoginEvent,"source">>(async cursor=>{
   const result=await db.rpc("customer_report_login_history",{p_customer_id:customerId,p_source:source}).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500);
   if(result.error?.code==="PGRST202"){missing=true;return {data:[],error:null};}
   return result;
  },signal);
  if(missing){network.status="setup-required";break;}
  network.events.push(...events.map(event=>({...event,source})));
 }
 let deviceMissing=false;
 const deviceRows=await readReportRows<Row & {browser_id:string|null;device_details:unknown}>(async cursor=>{
  const result=await db.rpc("customer_report_device_history",{p_customer_id:customerId}).lte("created_at",generatedAt).or(cursor).order("created_at").order("id").limit(500);
  if(result.error?.code==="PGRST202"){deviceMissing=true;return {data:[],error:null};}
  return result;
 },signal);
 network.deviceStatus=deviceMissing?"setup-required":"available";
 const devices=new Map(deviceRows.map(row=>[row.id,row]));
 for(const event of network.events){
  if(event.source!=="WEBSITE")continue;
  const row=devices.get(event.id);
  event.browser_id=row?.browser_id&&/^[0-9a-f-]{36}$/i.test(row.browser_id)?row.browser_id:null;
  event.device_details=normalizeCustomerDeviceDetails(row?.device_details);
 }
 network.events.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
 for(const prefix of ["current","previous"] as const){
  const at=loginResult.data?.[prefix === "current" ? "current_login_at" : "previous_login_at"],country=loginResult.data?.[prefix === "current" ? "current_country_code" : "previous_country_code"];
  if(typeof at==="string"&&typeof country==="string")network.countryHistory.push({created_at:at,countryCode:country});
 }
 const accumulator=new WalletSummaryAccumulator(null);
 for(const row of [...transactions].reverse())accumulator.add(row);
 const wallet=walletResult.data;
 const summary=accumulator.summaries()[0]??emptyWalletPeriodSummary(customerId,wallet??undefined,null);
 const activities=[person.last_sign_in_at,...topups.map(t=>t.created_at),...orders.values()].map(v=>typeof v==="string"?v:v?.created_at).filter((v):v is string=>!!v);
 const latestActivity=activities.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;
 return {generatedAt,timeZone,customer:{id:customerId,name:text(metadata.full_name)||text(metadata.name)||email||"Customer",email,phone:text(metadata.phone)||person.phone||"",telegram:text(metadata.telegram_username),registeredAt:person.created_at,lastSignIn:person.last_sign_in_at??null,latestActivity,emailVerified:!!person.email_confirmed_at,phoneVerified:!!person.phone_confirmed_at&&!!person.phone&&(!text(metadata.phone)||text(metadata.phone)===person.phone),country:loginResult.data?.current_country_code??null},wallet:{currency:wallet?.currency??"USD",balance:wallet?.balance??0,balanceReadAt:wallet?.updated_at??generatedAt,summary,reconciled:summary.closing!==null&&summary.closing===Math.round(Number(wallet?.balance??0)*100)},network,transactions,topups,orders:[...orders.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id))};
}
