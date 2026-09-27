import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderRefundRequest, RefundEvent } from "./order-refund-request";

export async function requireRefundAdmin() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access%20denied");
  return user;
}

// Call only after the page has checked customer ownership or administrator access.
export async function getOrderRefundHistory(orderId: string) {
  const admin = createAdminClient();
  const requests = await admin.from("order_refund_requests").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
  if (requests.error) throw new Error("Unable to load refund requests.");
  const rows = (requests.data ?? []) as OrderRefundRequest[];
  const events = rows.length ? await admin.from("order_refund_events").select("id,request_id,status,note,created_at").in("request_id", rows.map(row => row.id)).order("created_at") : { data: [], error: null };
  if (events.error) throw new Error("Unable to load refund history.");
  return { requests: rows, events: (events.data ?? []) as RefundEvent[], held: rows.some(r => r.status !== "REJECTED") };
}
