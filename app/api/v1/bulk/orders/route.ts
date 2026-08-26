import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

import { authorizeBulkApi, bulkApiNoStore } from "@/lib/bulk-api-auth";
import { MANUAL_USDT_NETWORKS } from "@/lib/manual-usdt";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type BulkOrderBody = {
  customer?: { name?: unknown; email?: unknown };
  items?: Array<{ productOptionId?: unknown; quantity?: unknown }>;
  note?: unknown;
};

export async function POST(request: NextRequest) {
  const unauthorized = authorizeBulkApi(request);
  if (unauthorized) return unauthorized;

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    return bulkApiNoStore({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as BulkOrderBody;
    const name = String(body.customer?.name ?? "").trim();
    const email = String(body.customer?.email ?? "").trim().toLowerCase();
    const note = String(body.note ?? "").trim().slice(0, 1000);
    const items = Array.isArray(body.items) ? body.items : [];

    if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || items.length < 1 || items.length > 30) {
      return bulkApiNoStore({ error: "Customer or item data is invalid." }, { status: 400 });
    }

    const normalizedItems = items.map((item) => ({
      productOptionId: String(item.productOptionId ?? "").trim(),
      quantity: Number(item.quantity),
    }));
    if (normalizedItems.some((item) => !/^[0-9a-f-]{36}$/i.test(item.productOptionId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000)) {
      return bulkApiNoStore({ error: "A product option or quantity is invalid." }, { status: 400 });
    }

    const admin = createAdminClient();
    const requestHash = createHash("sha256").update(JSON.stringify({ name, email, note, items: normalizedItems })).digest("hex");
    const existing = await admin.from("bulk_api_requests").select("request_hash, order_id, response_body, status").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.data) {
      if (existing.data.request_hash !== requestHash) return bulkApiNoStore({ error: "Idempotency-Key was already used for different data." }, { status: 409 });
      return bulkApiNoStore(existing.data.response_body ?? { orderId: existing.data.order_id, status: existing.data.status });
    }

    const recentCount = await admin.from("bulk_api_requests").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((recentCount.count ?? 0) >= 30) return bulkApiNoStore({ error: "Rate limit exceeded." }, { status: 429 });

    const reservation = await admin.from("bulk_api_requests").insert({ idempotency_key: idempotencyKey, request_hash: requestHash, status: "CREATING" });
    if (reservation.error) return bulkApiNoStore({ error: "Unable to reserve this request." }, { status: 409 });

    const optionIds = [...new Set(normalizedItems.map((item) => item.productOptionId))];
    const optionResult = await admin.from("product_options").select("id, is_active, is_in_stock, products!inner(id, status, delivery_type, is_bulk_order)").in("id", optionIds);
    const options = optionResult.data ?? [];
    const eligible = options.length === optionIds.length && options.every((option) => {
      const relation = Array.isArray(option.products) ? option.products[0] : option.products;
      return option.is_active && option.is_in_stock !== false && relation?.status === "ACTIVE" && relation.delivery_type === "MANUAL" && relation.is_bulk_order === true;
    });
    if (optionResult.error || !eligible) {
      await admin.from("bulk_api_requests").update({ status: "REJECTED" }).eq("idempotency_key", idempotencyKey);
      return bulkApiNoStore({ error: "Only active manual Bulk Delivery products are allowed." }, { status: 403 });
    }

    const orderResult = await admin.rpc("create_store_order", {
      p_customer_name: name,
      p_customer_email: email,
      p_customer_phone: "",
      p_payment_method: "upi",
      p_items: normalizedItems,
      p_customer_note: note || "Bulk API order",
    });
    if (orderResult.error || !orderResult.data?.id) {
      await admin.from("bulk_api_requests").update({ status: "FAILED" }).eq("idempotency_key", idempotencyKey);
      return bulkApiNoStore({ error: orderResult.error?.message ?? "Unable to create the bulk order." }, { status: 400 });
    }

    await admin.from("order_items").update({ order_type: "BULK_API" }).eq("order_id", orderResult.data.id);

    const responseBody = {
      orderId: orderResult.data.id,
      orderNumber: orderResult.data.order_number,
      status: "PENDING_PAYMENT",
      currency: "USD",
      amount: Number(orderResult.data.total),
      paymentMethod: "MANUAL_CRYPTO",
      networks: MANUAL_USDT_NETWORKS.map((network) => ({ id: network.id, name: network.label, address: network.address })),
    };
    await admin.from("bulk_api_requests").update({ order_id: orderResult.data.id, status: "PENDING_PAYMENT", response_body: responseBody }).eq("idempotency_key", idempotencyKey);
    return bulkApiNoStore(responseBody, { status: 201 });
  } catch {
    return bulkApiNoStore({ error: "Unable to create the bulk order." }, { status: 500 });
  }
}
