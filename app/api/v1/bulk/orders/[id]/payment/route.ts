import { NextRequest } from "next/server";

import { authorizeBulkApi, bulkApiNoStore } from "@/lib/bulk-api-auth";
import { isManualUsdtNetwork } from "@/lib/manual-usdt";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = authorizeBulkApi(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { network?: unknown; transactionHash?: unknown };
  const network = String(body.network ?? "").trim().toUpperCase();
  const transactionHash = String(body.transactionHash ?? "").trim();
  if (!isManualUsdtNetwork(network) || transactionHash.length < 40 || transactionHash.length > 120) {
    return bulkApiNoStore({ error: "Select a valid network and transaction hash." }, { status: 400 });
  }

  const admin = createAdminClient();
  const apiOrder = await admin.from("bulk_api_requests").select("order_id").eq("order_id", id).maybeSingle();
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
