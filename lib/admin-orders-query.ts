import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_ORDER_PAGE_SIZE = 10;
export const adminOrderColumns = `id,order_number,customer_id,customer_name,customer_email,customer_phone,total,currency,status,created_at,paid_at,delivered_at,
  order_items(id,product_name,option_name,denomination,platform,fulfillment_mode,player_id,customer_information,quantity,affiliate_commission_percent)`;
const nonTrashStatuses = ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING", "DELIVERED", "CANCELLED", "REFUNDED"];
const missingTrashStatus = (error: { code?: string; message?: string } | null) => error?.code === "22P02" && Boolean(error.message?.includes('invalid input value for enum order_status: "TRASHED"'));
const statusGroups = {
  pending: ["PENDING_PAYMENT"], review: ["PAYMENT_REVIEW"],
  processing: ["PAID", "PROCESSING"], completed: ["DELIVERED"], trash: ["TRASHED"],
} as const;
export function adminOrderStatus(value?: string) {
  return value && Object.prototype.hasOwnProperty.call(statusGroups, value) ? value as keyof typeof statusGroups : "all";
}
export function orderSearchFilter(query: string) {
  // Quote PostgREST values so commas/parentheses cannot introduce extra conditions.
  const literal = query.replace(/[\\%_*]/g, character => `\\${character}`).replace(/"/g, '\\"');
  const pattern = `"%${literal}%"`;
  return `order_number.ilike.${pattern},customer_email.ilike.${pattern}`;
}
export async function loadAdminOrders(admin: SupabaseClient, input: { status?: string; query?: string; page?: string }) {
  const status = adminOrderStatus(input.status);
  const query = (input.query ?? "").trim().slice(0, 200);
  let page = Math.max(1, Math.min(Number.parseInt(input.page ?? "1", 10) || 1, 1000000));
  const pageQuery = (pageNumber: number) => {
    let request = admin.from("orders").select(adminOrderColumns, { count: "exact" });
    request = status === "all" ? request.in("status", nonTrashStatuses) : request.in("status", [...statusGroups[status]]);
    if (query) request = request.or(orderSearchFilter(query));
    return request.order("created_at", { ascending: false }).order("id", { ascending: false }).range((pageNumber - 1) * ADMIN_ORDER_PAGE_SIZE, pageNumber * ADMIN_ORDER_PAGE_SIZE - 1);
  };
  const countQueries = Object.values(statusGroups).map(statuses => admin.from("orders").select("id", { count: "exact" }).in("status", [...statuses]).limit(0));
  const [initial, total, ...counts] = await Promise.all([
    pageQuery(page), admin.from("orders").select("id", { count: "exact", head: true }).in("status", nonTrashStatuses), ...countQueries,
  ]);
  if (missingTrashStatus(counts[4].error)) counts[4] = { ...counts[4], error: null, count: 0, data: [], success: true, status: 200, statusText: "OK" };
  let result = initial;
  if (status === "trash" && missingTrashStatus(result.error)) result = { ...result, error: null, count: 0, data: [], success: true, status: 200, statusText: "OK" };
  // PostgREST may report an out-of-range page as HTTP 416 instead of an empty page.
  if (result.error?.code === "PGRST103") result = await pageQuery(1);
  if (result.error || total.error || counts.some(result => result.error)) throw new Error("Unable to load orders. Please try again.");
  const matchedCount = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(matchedCount / ADMIN_ORDER_PAGE_SIZE));
  if (page > totalPages) {
    page = totalPages;
    result = status === "trash" && missingTrashStatus(initial.error) ? result : await pageQuery(page);
    if (result.error) throw new Error("Unable to load orders. Please try again.");
  }
  return { orders: result.data ?? [], query, status, page, totalPages, matchedCount,
    counts: { all: total.count ?? 0, pending: counts[0].count ?? 0, review: counts[1].count ?? 0, processing: counts[2].count ?? 0, completed: counts[3].count ?? 0, trash: counts[4].count ?? 0 } };
}
