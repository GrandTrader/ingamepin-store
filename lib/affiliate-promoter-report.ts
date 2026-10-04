import { affiliateCommissionLimit } from "./affiliate-commission";

export type ReportCommission = { id: string; order_id: string; order_item_id: string; product_id: string; commission_amount: number | string; commission_percent: number | string; status: string; created_at: string; available_at: string; rejection_reason: string | null };
export type ReportProduct = { id: string; name: string; public_path: string | null; status: string; retail_enabled: boolean; affiliate_enabled: boolean; affiliate_commission_percent: number | string };
export type ReportOrder = { id: string; order_number: string; status: string; currency: string; created_at: string; order_items: { id: string; product_id: string | null; product_name: string; option_name: string | null; quantity: number; total_price: number | string; affiliate_commission_percent: number | string }[] };
export type ReportClick = { id: string; product_id: string | null; created_at: string };
export type GeneratedLink = { product_id: string; created_at: string; last_copied_at: string };
export type ReportRate = { product_id: string; commission_percent: number | string };
export type ReportPayout = { id: string; amount: number | string; fee_amount: number | string; net_amount: number | string; status: string; network: string; wallet_address: string; transaction_id: string | null; created_at: string; paid_at: string | null };

const earnedStates = new Set(["PENDING", "AVAILABLE", "REQUESTED", "PAID"]);
export function summarizePromoter(commissions: ReportCommission[], orders: ReportOrder[]) {
  const cents: Record<string, number> = {};
  for (const row of commissions) cents[row.status] = (cents[row.status] ?? 0) + Math.round(Number(row.commission_amount) * 100);
  const balances = Object.fromEntries(Object.entries(cents).map(([state, amount]) => [state, amount / 100]));
  const earned = Object.entries(cents).reduce((sum, [state, amount]) => sum + (earnedStates.has(state) ? amount : 0), 0) / 100;
  const paidOrders = orders.filter(order => ["PAID", "PROCESSING", "DELIVERED"].includes(order.status));
  return { balances, earned, paidOrders: paidOrders.length, referredOrders: orders.length };
}

export function promoterLinkStatus(product: ReportProduct, programEnabled: boolean, promoterStatus: string, override: number | string | null, selected?: number | string) {
  const maximum = affiliateCommissionLimit(product.affiliate_commission_percent, override);
  const rate = Math.max(0, Math.min(maximum, Number(selected ?? maximum)));
  const reason = !programEnabled ? "Program paused" : promoterStatus !== "APPROVED" ? "Promoter not approved" : product.status !== "ACTIVE" ? "Product inactive" : !product.retail_enabled ? "Retail disabled" : !product.affiliate_enabled ? "Affiliate disabled" : rate <= 0 ? "No commission set" : "Active";
  return { active: reason === "Active", reason, rate };
}

export function promoterSales(orders: ReportOrder[], commissions: ReportCommission[]) {
  const byItem = new Map(commissions.map(row => [row.order_item_id, row]));
  return orders.flatMap(order => order.order_items.filter(item => Number(item.affiliate_commission_percent) > 0 || byItem.has(item.id)).map(item => ({ order, item, commission: byItem.get(item.id) ?? null })));
}
