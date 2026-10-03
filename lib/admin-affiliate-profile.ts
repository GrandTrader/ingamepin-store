import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedLink, ReportClick, ReportCommission, ReportOrder, ReportPayout, ReportProduct, ReportRate } from "./affiliate-promoter-report";

// Fetch every page so totals do not silently stop at the database's row limit.
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999);
    if (result.error) throw Error("Unable to load promoter activity. Please try again.");
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return rows;
  }
}

export async function loadAffiliateProfile(id: string) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access denied");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db = createAdminClient();
  const result = await db.from("affiliate_accounts").select("id,user_id,full_name,affiliate_code,status,country_code,promotion_channel,promotion_url,promotion_plan,commission_override_percent,created_at").eq("id", id).maybeSingle();
  if (result.error) throw Error("Unable to load promoter profile.");
  if (!result.data) notFound();
  const account = result.data;
  const [identity, settings, commissions, orders, clicks, rates, products, payouts, tracking] = await Promise.all([
    db.auth.admin.getUserById(account.user_id),
    db.from("affiliate_settings").select("program_enabled").eq("id", 1).single(),
    allRows<ReportCommission>((a,b) => db.from("affiliate_commissions").select("id,order_id,order_item_id,product_id,commission_amount,commission_percent,status,created_at,available_at,rejection_reason").eq("affiliate_id", id).order("id").range(a,b)),
    allRows<ReportOrder>((a,b) => db.from("orders").select("id,order_number,status,currency,created_at,order_items(id,product_id,product_name,option_name,quantity,total_price,affiliate_commission_percent)").eq("affiliate_id", id).order("created_at", {ascending:false}).order("id").range(a,b)),
    allRows<ReportClick>((a,b) => db.from("affiliate_clicks").select("id,product_id,created_at").eq("affiliate_id", id).order("id").range(a,b)),
    allRows<ReportRate>((a,b) => db.from("affiliate_product_rates").select("product_id,commission_percent").eq("affiliate_id", id).order("id").range(a,b)),
    allRows<ReportProduct>((a,b) => db.from("products").select("id,name,slug,status,retail_enabled,affiliate_enabled,affiliate_commission_percent").order("id").range(a,b)),
    allRows<ReportPayout>((a,b) => db.from("affiliate_payout_requests").select("id,amount,fee_amount,net_amount,status,network,wallet_address,transaction_id,created_at,paid_at").eq("affiliate_id", id).order("created_at", {ascending:false}).order("id").range(a,b)),
    db.from("affiliate_generated_links").select("product_id", {count:"exact",head:true}).eq("affiliate_id", id),
  ]);
  if (identity.error || settings.error) throw Error("Unable to load promoter profile settings.");
  const trackingReady = !tracking.error;
  if (tracking.error && !["PGRST205", "42P01"].includes(tracking.error.code)) throw Error("Unable to load generated link history.");
  const generated = trackingReady ? await allRows<GeneratedLink>((a,b) => db.from("affiliate_generated_links").select("product_id,created_at,last_copied_at").eq("affiliate_id", id).order("product_id").range(a,b)) : [];
  return { account: {...account, email: identity.data.user?.email ?? ""}, programEnabled: settings.data?.program_enabled === true, commissions, orders, clicks, rates, products, payouts, generated, trackingReady };
}
