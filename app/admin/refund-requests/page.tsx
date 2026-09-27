import Link from "next/link";
import AdminSidebar from "../AdminSidebar";
import { requireRefundAdmin } from "@/lib/order-refund-data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderRefundRequest } from "@/lib/order-refund-request";
import OrderRefundHistory from "@/components/OrderRefundHistory";
import RefundReviewForm from "./RefundReviewForm";

export const dynamic = "force-dynamic";
export default async function RefundRequestsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  await requireRefundAdmin();
  const params = await searchParams;
  const history = params.view === "history";
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page || "1") || 1));
  const admin = createAdminClient();
  const result = await admin.from("order_refund_requests").select("*", { count: "exact" }).in("status", history ? ["COMPLETED", "REJECTED"] : ["REQUESTED", "APPROVED"]).order("created_at", { ascending: !history }).range((page - 1) * 30, page * 30 - 1);
  if (result.error) throw new Error("Unable to load refund requests.");
  const requests = (result.data ?? []) as OrderRefundRequest[];
  const orders = requests.length ? await admin.from("orders").select("id,order_number,customer_email").in("id", requests.map(r => r.order_id)) : { data: [], error: null };
  if (orders.error) throw new Error("Unable to load refund order details.");
  const view = history ? "history" : "pending";
  return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 space-y-6 p-5 sm:p-8">
    <h1 className="text-3xl font-black">Refund requests</h1>
    <nav className="flex gap-4"><Link className={!history ? "font-bold text-blue-700" : ""} href="/admin/refund-requests">Needs review / transfer</Link><Link className={history ? "font-bold text-blue-700" : ""} href="/admin/refund-requests?view=history">Refund history</Link></nav>
    {!requests.length && <p className="rounded-xl border bg-white p-5">No refund requests in this view.</p>}
    {requests.map(request => { const order = orders.data?.find(o => o.id === request.order_id); return <section key={request.id} className="rounded-2xl border bg-white p-4 sm:p-6">
      <Link href={`/admin/orders/${request.order_id}/receipt`} className="font-bold text-blue-700">{order?.order_number || request.order_id} → View order</Link><p className="my-3 break-all text-sm">{order?.customer_email}</p>
      <OrderRefundHistory requests={[request]} events={[]} /><RefundReviewForm request={request} />
    </section>; })}
    <nav className="flex justify-between">{page > 1 ? <Link href={`/admin/refund-requests?view=${view}&page=${page - 1}`}>← Previous</Link> : <span />}<span>Page {page}</span>{page * 30 < (result.count || 0) ? <Link href={`/admin/refund-requests?view=${view}&page=${page + 1}`}>Next →</Link> : <span />}</nav>
  </main></div></div>;
}
