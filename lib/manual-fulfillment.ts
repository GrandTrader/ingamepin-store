import { createAdminClient } from "@/lib/supabase/admin";

export async function prepareOrderForManualFulfillment(
  orderId: string,
) {
  const admin = createAdminClient();
  const itemResult = await admin
    .from("order_items")
    .select("id, products!inner(delivery_type)")
    .eq("order_id", orderId);

  if (itemResult.error) {
    throw new Error(
      `Unable to load order items for manual fulfillment: ${itemResult.error.message}`,
    );
  }

  const supplierIds = new Set<string>();
  const jobs = await admin.from("definiteplay_jobs").select("item_id").eq("order_id", orderId);
  // A missing table means the integration has not been installed. Other failures
  // must block release of any codes until supplier ownership can be verified.
  if (jobs.error && !["42P01", "PGRST205"].includes(jobs.error.code)) {
    throw new Error("Unable to check supplier delivery.");
  }
  for (const job of jobs.data ?? []) supplierIds.add(job.item_id);
  const itemIds = (itemResult.data ?? [])
    .filter((item) => {
      const product = Array.isArray(item.products)
        ? item.products[0]
        : item.products;
      return product?.delivery_type === "MANUAL" && !supplierIds.has(item.id);
    })
    .map((item) => item.id);

  if (itemIds.length === 0) {
    const existingOrder = await admin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();
    if (existingOrder.error) {
      throw new Error(
        `Unable to confirm the instant order: ${existingOrder.error.message}`,
      );
    }
    return existingOrder.data;
  }

  const releaseResult = await admin
    .from("gift_card_codes")
    .update({
      status: "AVAILABLE",
      order_item_id: null,
      reserved_at: null,
      sold_at: null,
    })
    .in("order_item_id", itemIds)
    .in("status", ["RESERVED"]);

  if (releaseResult.error) {
    throw new Error(
      `Unable to release manual-item delivery codes: ${releaseResult.error.message}`,
    );
  }

  const orderResult = await admin
    .from("orders")
    .update({
      status: "PROCESSING",
      delivered_at: null,
    })
    .eq("id", orderId)
    .in("status", [
      "PAID",
      "PROCESSING",
    ])
    .select("id, status")
    .maybeSingle();

  if (orderResult.error) {
    throw new Error(
      `Unable to prepare the paid order: ${orderResult.error.message}`,
    );
  }

  if (!orderResult.data) {
    const completed = await admin.from("orders").select("id,status").eq("id", orderId).eq("status","DELIVERED").maybeSingle();
    if (!completed.error && completed.data) return completed.data;
    throw new Error(
      "Only a successfully paid order can enter manual fulfillment.",
    );
  }

  return orderResult.data;
}
