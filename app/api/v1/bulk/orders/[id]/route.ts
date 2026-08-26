import { NextRequest } from "next/server";

import { authorizeBulkApi, bulkApiNoStore } from "@/lib/bulk-api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeBulkApi(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const admin = createAdminClient();
  let apiOrderQuery = admin.from("bulk_api_requests").select("order_id").eq("order_id", id);
  apiOrderQuery = auth.principal.clientId ? apiOrderQuery.eq("client_id", auth.principal.clientId) : apiOrderQuery.is("client_id", null);
  const apiOrder = await apiOrderQuery.maybeSingle();
  if (!apiOrder.data) return bulkApiNoStore({ error: "Bulk API order was not found." }, { status: 404 });

  const [order, payment] = await Promise.all([
    admin.from("orders").select("id, order_number, status, total, currency, paid_at, delivered_at, created_at").eq("id", id).single(),
    admin.from("payments").select("status, submitted_at, verified_at, rejection_reason").eq("order_id", id).single(),
  ]);
  if (order.error || payment.error) return bulkApiNoStore({ error: "Unable to load the bulk order." }, { status: 500 });
  return bulkApiNoStore({ order: { id: order.data.id, orderNumber: order.data.order_number, status: order.data.status, paymentStatus: payment.data.status, amount: Number(order.data.total), currency: order.data.currency, createdAt: order.data.created_at, paidAt: order.data.paid_at, deliveredAt: order.data.delivered_at, paymentSubmittedAt: payment.data.submitted_at, paymentVerifiedAt: payment.data.verified_at, rejectionReason: payment.data.rejection_reason } });
}
