import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type DashboardClient = ReturnType<typeof createAdminClient>;

export type DashboardSummary = {
  orders: number;
  reviews: number;
  processing: number;
  revenue: number;
};

export type RecentDashboardOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
};

export type DashboardResult<T> = { data: T; error?: never } | { data?: never; error: string };

// Call only after verifying the signed-in admin. Results are never shared across requests.
export async function loadDashboardSummary(db: DashboardClient): Promise<DashboardResult<DashboardSummary>> {
  const failure = { error: "The overview could not be updated. Try again." };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    const signal = AbortSignal.timeout(10_000);
    const [orders, reviews, processing, revenue] = await Promise.all([
      db.from("orders").select("id", { count: "exact", head: true }).abortSignal(signal),
      db.from("payments").select("id", { count: "exact", head: true }).eq("status", "SUBMITTED").abortSignal(signal),
      db.from("orders").select("id", { count: "exact", head: true }).in("status", ["PAID", "PROCESSING"]).abortSignal(signal),
      db.from("orders").select("total").gte("created_at", today.toISOString()).in("status", ["PAID", "PROCESSING", "DELIVERED"]).abortSignal(signal),
    ]);
    if (orders.error || reviews.error || processing.error || revenue.error ||
        orders.count === null || reviews.count === null || processing.count === null || revenue.data === null) {
      return failure;
    }
    return { data: {
      orders: orders.count,
      reviews: reviews.count,
      processing: processing.count,
      revenue: revenue.data.reduce((total, order) => total + Number(order.total ?? 0), 0),
    } };
  } catch {
    return failure;
  }
}

export async function loadRecentDashboardOrders(db: DashboardClient): Promise<DashboardResult<RecentDashboardOrder[]>> {
  const failure = { error: "Recent orders could not be updated. Try again." };
  try {
    const result = await db.from("orders")
      .select("id,order_number,customer_name,total,currency,status,created_at")
      .order("created_at", { ascending: false }).limit(5)
      .abortSignal(AbortSignal.timeout(10_000));
    if (result.error || result.data === null) return failure;
    return { data: result.data as RecentDashboardOrder[] };
  } catch {
    return failure;
  }
}
