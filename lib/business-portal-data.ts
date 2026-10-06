import "server-only";
import { businessSessionReady } from "@/lib/business-security";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessApplication } from "./business-verification-data";
import { dateBoundary, indiaMonth, monthlyBusinessTier, type SpendOrder, type SpendRefund } from "./business-portal";
export const portalCustomer = cache(async () => {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) redirect("/business/login?error=Please sign in with a verified email.");
  const application = await businessApplication(user.id);
  if (application?.status !== "APPROVED") redirect("/account/business");
  if (!(await businessSessionReady(session, user.id))) redirect("/account/business/setup");
  return { user, application, email: user.email.toLowerCase(), session };
});
export async function businessSummary() {
  const { user, email, application } = await portalCustomer();
  const db = createAdminClient(), now = new Date(), month = indiaMonth(now);
  const orders: SpendOrder[] = [], refunds: SpendRefund[] = [];
  const walletPromise = db.from("customer_wallets").select("balance,currency").eq("user_id", user.id).maybeSingle();
  for (let from = 0; ; from += 500) {
    const result = await db.from("orders").select("id,subtotal,discount,currency,status,paid_at").eq("customer_email", email).eq("sales_channel","BUSINESS").gte("paid_at", month.start).lt("paid_at", month.end).in("status", ["PAID","PROCESSING","DELIVERED"]).order("id").range(from, from + 499);
    if (result.error) throw Error("Unable to load monthly purchases.");
    orders.push(...result.data);
    if (result.data.length < 500) break;
  }
  for (let chunk = 0; chunk < orders.length; chunk += 100) {
    for (let from = 0; ; from += 500) {
      const result = await db.from("order_item_refunds").select("order_id,amount,currency,status").in("order_id", orders.slice(chunk, chunk+100).map(o=>o.id)).order("id").range(from, from+499);
      if (result.error) throw Error("Unable to load refunded purchases.");
      refunds.push(...result.data);
      if (result.data.length < 500) break;
    }
  }
  const wallet = await walletPromise;
  if (wallet.error) throw Error("Unable to load your wallet balance.");
  return { name: application.details.legal_name, wallet: wallet.data ?? { balance: 0, currency: "USD" }, ...monthlyBusinessTier(orders,refunds,now) };
}
export type PortalFilters = { page?: string; q?: string; from?: string; to?: string; status?: string; type?: string };
export const ORDER_SELECT = "id,order_number,total,currency,status,created_at,order_items(id,product_name,option_name,quantity)";
export function customerOrders(email: string, filters: PortalFilters) {
  let query = createAdminClient().from("orders").select(ORDER_SELECT, { count: "exact" }).eq("customer_email", email).eq("sales_channel","BUSINESS");
  const q = filters.q?.trim().slice(0,100);
  if(q) query = query.ilike("order_number", "%" + q.replace(/[\\%_]/g, "\\$&") + "%");
  if (["DELIVERED","PAID","PROCESSING","PENDING_PAYMENT","PAYMENT_REVIEW","CANCELLED","REFUNDED"].includes(filters.status ?? "")) query = query.eq("status",filters.status!);
  const start = dateBoundary(filters.from), end = dateBoundary(filters.to,true);
  if (start) query = query.gte("created_at",start);
  if (end) query = query.lt("created_at",end);
  return query.order("created_at", { ascending: false }).order("id", { ascending: false });
}
export function customerStatement(userId: string, filters: PortalFilters) {
  let query = createAdminClient().from("wallet_transactions").select("id,transaction_type,amount,balance_after,description,order_id,reference_id,created_at", { count: "exact" }).eq("user_id",userId);
  const start = dateBoundary(filters.from), end = dateBoundary(filters.to,true);
  if (start) query = query.gte("created_at",start);
  if (end) query = query.lt("created_at",end);
  if(filters.type === "DEBIT") query = query.eq("transaction_type","DEBIT");
  if(filters.type === "CREDIT") query = query.eq("transaction_type","CREDIT");
  return query.order("created_at", {ascending:false}).order("id", {ascending:false});
}

export const catalogueRegions = unstable_cache(async () => {
  const regions = new Set<string>();
  for(let from=0;;from+=1000) {
    const r=await createAdminClient().from("products").select("region").eq("status","ACTIVE").eq("business_enabled", true).eq("is_preorder_only",false).order("id").range(from,from+999);
    if(r.error)throw Error("Unable to load catalogue regions.");
    for(const row of r.data)if(row.region)regions.add(row.region);
    if(r.data.length<1000)break;
  }
  return [...regions].sort();
}, ["business-catalogue-regions"], {revalidate:60,tags:["business-catalogue"]});
