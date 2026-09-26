import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_RECEIPT_BUCKET, readDeliveryReceipt } from "./delivery-receipt-file";

// The caller must first verify administrator access, including required MFA.
export async function completeServiceWithReceipt(
  admin: SupabaseClient, orderId: string, itemId: string, administratorId: string, file: File,
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![orderId, itemId, administratorId].every(value => uuid.test(value))) throw new Error("Invalid order item.");
  const item = await admin.from("order_items")
    .select("id, service_delivered_at, orders!inner(status), products!inner(delivery_type)")
    .eq("id", itemId).eq("order_id", orderId).eq("products.delivery_type", "MANUAL").maybeSingle();
  if (item.error || !item.data) throw new Error("Manual delivery item was not found.");
  const order = Array.isArray(item.data.orders) ? item.data.orders[0] : item.data.orders;
  if (item.data.service_delivered_at) throw new Error("This item is already completed. Refresh the order to view its receipt.");
  if (!order || !["PAID", "PROCESSING"].includes(order.status)) throw new Error("Payment must be verified before delivery.");
  const receipt = await readDeliveryReceipt(file);
  const path = `${orderId}/${itemId}/${randomUUID()}.${receipt.extension}`;
  const upload = await admin.storage.from(DELIVERY_RECEIPT_BUCKET).upload(path, receipt.bytes, {
    contentType: receipt.contentType, upsert: false, cacheControl: "0",
  });
  if (upload.error) throw new Error("Receipt upload failed. The order has not been completed. Please try again.");
  const completion = await admin.rpc("complete_manual_service_with_receipt", {
    p_order_id: orderId, p_item_id: itemId, p_admin_user_id: administratorId,
    p_receipt_path: path,
  });
  // Keep the private object on an ambiguous response: the transaction may have committed.
  // Retrying cannot replace an existing receipt or complete the item twice.
  if (completion.error) throw new Error("Unable to confirm receipt delivery. Refresh the order before retrying.");
  return completion;
}

// Call only AFTER verifying order ownership, guest credentials or administrator access.
// Customers receive links only once the entire order is delivered.
export async function getAuthorizedDeliveryReceipts(
  admin: SupabaseClient, orderId: string, status: string, audience: "customer" | "admin" = "customer",
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (audience === "customer" && status !== "DELIVERED") return links;
  const result = await admin.from("order_delivery_receipts")
    .select("order_item_id, storage_path").eq("order_id", orderId);
  if (result.error) throw new Error("Unable to load delivery receipts.");
  await Promise.all((result.data ?? []).map(async receipt => {
    // Never sign an object outside this order and item, even if metadata is corrupt.
    if (!receipt.storage_path.startsWith(`${orderId}/${receipt.order_item_id}/`) || receipt.storage_path.includes("..")) return;
    const signed = await admin.storage.from(DELIVERY_RECEIPT_BUCKET).createSignedUrl(receipt.storage_path, 900);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Unable to open delivery receipt. Please refresh the order.");
    links.set(receipt.order_item_id, signed.data.signedUrl);
  }));
  return links;
}
