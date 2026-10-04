"use client";

import Link from "next/link";
import AffiliateLinkUpdateNotice from "@/components/AffiliateLinkUpdateNotice";
import { useState } from "react";
import type { loadAffiliateProfile } from "@/lib/admin-affiliate-profile";
import { promoterLinkStatus, promoterSales, summarizePromoter } from "@/lib/affiliate-promoter-report";

type Data = Awaited<ReturnType<typeof loadAffiliateProfile>>;
type Tab = "Products sold" | "Orders & earnings" | "Affiliate links" | "Payouts";
const tabs: Tab[] = ["Products sold", "Orders & earnings", "Affiliate links", "Payouts"];
const earnedStates = new Set(["PENDING", "AVAILABLE", "REQUESTED", "PAID"]);
const money = (amount: number | string) => `${Number(amount).toFixed(2)} USDT`;
const date = (value: string) => new Date(value).toLocaleString("en-GB", {timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"});
const field = "min-h-[44px]! min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm";
const badge = "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";

export default function PromoterProfile({data,initialTab="Products sold"}: {data:Data;initialTab?:Tab}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");
  const {account, commissions, orders, clicks, rates, products, payouts, generated} = data;
  const summary = summarizePromoter(commissions, orders);
  const sales = promoterSales(orders, commissions);
  const query = search.trim().toLowerCase();
  const matches = (...values: (string | null)[]) => values.some(value => value?.toLowerCase().includes(query));
  const linkRows = products.map(product => {
    const saved = generated.find(row => row.product_id === product.id);
    const visits = clicks.filter(row => row.product_id === product.id);
    const selected = rates.find(row => row.product_id === product.id);
    const state = promoterLinkStatus(product, data.programEnabled, account.status, account.commission_override_percent, selected?.commission_percent);
    return {product, saved, visits, state, url:product.public_path ? `https://www.ingamepin.com${product.public_path}` : ""};
  }).filter(row => row.product.affiliate_enabled || row.saved || row.visits.length || rates.some(rate => rate.product_id === row.product.id) || commissions.some(c => c.product_id === row.product.id));
  const productRows = [...new Set(sales.map(row => row.item.product_id ?? row.item.product_name))].map(id => {
    const rows = sales.filter(row => (row.item.product_id ?? row.item.product_name) === id);
    const paid = rows.filter(row => ["PAID", "PROCESSING", "DELIVERED"].includes(row.order.status));
    return {id, name:rows[0].item.product_name, quantity:paid.reduce((sum,row) => sum + row.item.quantity,0), count:new Set(paid.map(row => row.order.id)).size, earnings:rows.reduce((sum,row) => sum + (row.commission && earnedStates.has(row.commission.status) ? Math.round(Number(row.commission.commission_amount)*100) : 0),0)/100};
  }).sort((a,b) => b.earnings-a.earnings || a.name.localeCompare(b.name));
  const displayedProducts = productRows.filter(row => matches(row.name));
  const displayedSales = sales.filter(row => matches(row.item.product_name,row.item.option_name,row.order.order_number) && (status === "all" || row.commission?.status === status || (status === "UNRECORDED" && !row.commission)));
  const displayedLinks = linkRows.filter(row => matches(row.product.name,row.url) && (status === "all" || (status === "active" && row.state.active) || (status === "inactive" && !row.state.active) || (status === "generated" && !!row.saved) || (status === "visited" && row.visits.length>0)));
  const displayedPayouts = payouts.filter(row => matches(row.network,row.transaction_id,row.status) && (status === "all" || row.status === status));
  const count = tab === "Products sold" ? displayedProducts.length : tab === "Orders & earnings" ? displayedSales.length : tab === "Affiliate links" ? displayedLinks.length : displayedPayouts.length;
  const currentPage = Math.min(page,Math.max(0,Math.ceil(count/20)-1));
  const slice = <T,>(rows:T[]) => rows.slice(currentPage*20,(currentPage+1)*20);
  const states = tab === "Orders & earnings" ? ["PENDING","AVAILABLE","HELD","REQUESTED","PAID","REJECTED","CANCELLED","UNRECORDED"] : tab === "Payouts" ? ["PENDING","APPROVED","PAID","REJECTED","CANCELLED"] : ["active","inactive","generated","visited"];
  async function copy(url:string) { try { await navigator.clipboard.writeText(url); setCopyMessage("Link copied."); } catch { setCopyMessage("Unable to copy. Select and copy the link below."); } }
  return <>
    <header className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="break-words text-2xl font-black">{account.full_name}</h1><span className={badge}>{account.status}</span></div>
      <p className="mt-1 break-all text-sm">{account.email || "Email unavailable"}</p>
      <p className="mt-2 text-xs text-slate-500">{account.affiliate_code} · {account.country_code} · {account.promotion_channel.replaceAll("_"," ")} · Joined {date(account.created_at)} IST</p>
      <details className="mt-3 text-sm"><summary className="cursor-pointer py-2 font-bold">Profile details</summary><p className="mt-2 whitespace-pre-wrap break-words">{account.promotion_plan || "No promotion plan provided."}</p>{account.promotion_url && <p className="mt-2 break-all">Promotion page: {account.promotion_url}</p>}<p className="mt-2">Commission override: {account.commission_override_percent == null ? "Product default rate" : `${account.commission_override_percent}%`}</p></details>
    </header>
    <section aria-label="Earnings summary" className="my-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
      {[["Available balance",money(summary.balances.AVAILABLE??0)],["Pending",money(summary.balances.PENDING??0)],["In payout requests",money(summary.balances.REQUESTED??0)],["Paid commission",money(summary.balances.PAID??0)],["Total earned",money(summary.earned)],["Held for review",money(summary.balances.HELD??0)],["Paid orders",String(summary.paidOrders)],["Tracked visits",String(clicks.length)]].map(([label,value]) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-600">{label}</p><p className="mt-1 break-words text-lg font-black">{value}</p></div>)}
    </section>
    <p className="text-xs text-slate-500">All-time recorded earnings. Total earned excludes held, rejected and cancelled commissions. Paid commission is before payout fees. Visits follow existing duplicate-visit filtering. Dates are IST.</p>
    <nav aria-label="Promoter reports" className="mt-4 flex flex-wrap gap-2">{tabs.map(label => <button key={label} onClick={() => {setTab(label);setPage(0);setSearch("");setStatus("all");}} aria-pressed={tab===label} className={`min-h-[44px]! rounded-lg px-3 py-2 text-sm font-bold ${tab===label?"bg-blue-600 text-white":"bg-slate-100 text-slate-700"}`}>{label}</button>)}</nav>
    <div className="my-3 flex flex-wrap gap-2"><input aria-label="Search promoter activity" className={`${field} flex-1`} placeholder={tab==="Orders & earnings"?"Search product or order…":"Search…"} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>{tab!=="Products sold" && <select aria-label="Filter activity status" className={field} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">All statuses</option>{states.map(value=><option key={value} value={value}>{value === "generated" ? "Copied by promoter" : value === "visited" ? "Has tracked visits" : value}</option>)}</select>}<button className={field} onClick={()=>{setSearch("");setStatus("all");setPage(0);}}>Reset</button></div>
    {tab === "Affiliate links" && <AffiliateLinkUpdateNotice/>}
    {tab === "Affiliate links" && <p className="mb-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">{data.trackingReady ? "Copied dates are recorded from the tracking update onward. Older links may have visits without a recorded copy." : "Copy history needs the link-tracking database update. Existing visits and link eligibility are available now."} Active means eligible for commission under current settings; stock is checked at checkout. Links shown here use the promoter’s referral code.</p>}
    {copyMessage && tab==="Affiliate links" && <p role="status" className="mb-2 text-sm">{copyMessage}</p>}
    <p className="mb-2 text-xs text-slate-500" role="status">{count} results</p>
    <section className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
      {tab==="Products sold" && slice(displayedProducts).map(row=><article key={row.id} className="p-3"><h2 className="break-words text-sm font-bold">{row.name}</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm"><span>Paid orders: <b>{row.count}</b></span><span>Units sold: <b>{row.quantity}</b></span><span>Earned: <b>{money(row.earnings)}</b></span></div></article>)}
      {tab==="Orders & earnings" && slice(displayedSales).map(row=><article key={row.item.id} className="p-3"><div className="flex flex-wrap justify-between gap-2"><h2 className="break-words text-sm font-bold">{row.item.product_name}</h2><span className={badge}>{row.order.status}</span></div><p className="mt-1 text-xs text-slate-600">{row.item.option_name} · Quantity {row.item.quantity} · {date(row.order.created_at)}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link className="font-bold text-blue-700 underline" href={`/admin/orders/${encodeURIComponent(row.order.id)}/receipt`}>{row.order.order_number}</Link><span>Item total: {Number(row.item.total_price).toFixed(2)} {row.order.currency}</span><span>Commission: <b>{row.commission ? money(row.commission.commission_amount) : "Not recorded"}</b>{row.commission && ` · ${row.commission.commission_percent}% · ${row.commission.status}`}</span></div>{row.commission?.status==="PENDING" && <p className="mt-2 text-xs text-slate-500">Scheduled availability: {date(row.commission.available_at)} IST</p>}{row.commission?.rejection_reason && <p className="mt-2 text-xs text-red-700">{row.commission.rejection_reason}</p>}</article>)}
      {tab==="Affiliate links" && slice(displayedLinks).map(row=><article key={row.product.id} className="p-3"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-sm font-bold">{row.product.name}</h2><span className={`${badge} ${row.state.active?"bg-emerald-50 text-emerald-700":""}`}>{row.state.reason}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>Product maximum: {row.product.affiliate_commission_percent}%</span><span>Promoter override: {account.commission_override_percent == null ? "Default" : `${account.commission_override_percent}%`}</span><span>Saved rate: {rates.find(rate => rate.product_id === row.product.id)?.commission_percent ?? "Default"}</span><span>Tracked visits: {row.visits.length}</span><span>First copied: {row.saved?date(row.saved.created_at):"Not recorded"}</span>{row.saved && <span>Last copied: {date(row.saved.last_copied_at)}</span>}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly aria-label={`Affiliate link for ${row.product.name}`} value={row.url || "Public product address unavailable"} className={`${field} flex-1 text-xs!`}/><button type="button" disabled={!row.url} onClick={()=>copy(row.url)} className={`${field} font-bold`}>Copy link</button></div></article>)}
      {tab==="Payouts" && slice(displayedPayouts).map(row=><article key={row.id} className="p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{money(row.net_amount)} · {row.network}</h2><span className={badge}>{row.status}</span></div><p className="mt-2 text-xs text-slate-600">Gross {money(row.amount)} · Fee {money(row.fee_amount)} · Requested {date(row.created_at)}</p><p className="mt-2 break-all">Wallet: {row.wallet_address}</p>{row.transaction_id && <p className="mt-1 break-all">Transaction: {row.transaction_id}</p>}{row.paid_at && <p className="mt-1 text-xs">Paid {date(row.paid_at)}</p>}</article>)}
      {!count && <p className="p-6 text-center text-sm text-slate-500">No matching activity.</p>}
    </section>
    {count>20 && <nav aria-label="Activity pages" className="mt-3 flex items-center justify-between gap-2 text-sm"><button className={field} disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Previous</button><span>{currentPage+1} / {Math.ceil(count/20)}</span><button className={field} disabled={(currentPage+1)*20>=count} onClick={()=>setPage(currentPage+1)}>Next</button></nav>}
    <Link href="/admin/affiliates/payouts" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-bold text-blue-700">Manage payout requests →</Link>
  </>;
}
