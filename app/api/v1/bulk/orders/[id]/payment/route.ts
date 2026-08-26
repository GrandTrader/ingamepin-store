import { NextRequest } from "next/server";

import { authorizeBulkApi, bulkApiNoStore } from "@/lib/bulk-api-auth";
import { isManualUsdtNetwork, isValidManualPaymentReference } from "@/lib/manual-usdt";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeBulkApi(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { network?: unknown; transactionHash?: unknown };
  const network = String(body.network ?? "").trim().toUpperCase();
  const transactionHash = String(body.transactionHash ?? "").trim();
  if (!isManualUsdtNetwork(network) || !isValidManualPaymentReference(network, transactionHash)) {
    return bulkApiNoStore({ error: "Select a valid payment option and transaction reference." }, { status: 400 });
  }

  const admin = createAdminClient();
  let apiOrderQuery = admin.from("bulk_api_requests").select("order_id").eq("order_id", id);
  apiOrderQuery = auth.principal.clientId ? apiOrderQuery.eq("client_id", auth.principal.clientId) : apiOrderQuery.is("client_id", null);
  const apiOrder = await apiOrderQuery.maybeSingle();
  if (!apiOrder.data) return bulkApiNoStore({ error: "Bulk API order was not found." }, { status: 404 });

  const order = await admin.from("orders").select("id, order_number, customer_email").eq("id", id).single();
  if (order.error) return bulkApiNoStore({ error: "Bulk API order was not found." }, { status: 404 });
  const result = await admin.rpc("submit_manual_payment", {
    p_order_id: order.data.id,
    p_order_number: order.data.order_number,
    p_customer_email: order.data.customer_email,
    p_transaction_id: `${network}:${transactionHash}`,
    p_screenshot_path: "",
  });
  if (result.error) return bulkApiNoStore({ error: result.error.message }, { status: 400 });

  await admin.from("bulk_api_requests").update({ status: "PAYMENT_REVIEW" }).eq("order_id", id);
  return bulkApiNoStore({ orderId: id, status: "PAYMENT_REVIEW" });
}
