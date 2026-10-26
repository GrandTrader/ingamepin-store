import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export function supplierDeliveryEnabled() {
  return process.env.DEFINITEPLAY_FULFILLMENT_ENABLED?.trim() === "true";
}

export async function supplierProductIds(ids: string[]): Promise<Set<string>> {
  // Existing products follow their durable stock source even if rollout settings change.
  if (!ids.length) return new Set();
  const result = await createAdminClient().from("products").select("id,stock_source").in("id", ids);
  if (result.error?.code === "42703") return new Set(); // Schema not installed yet.
  if (result.error) throw new Error("Supplier delivery setup is not ready.");
  if ((result.data ?? []).some(p => p.stock_source === "GIFTPORT")) {
    throw new Error("This supplier is disconnected. Remove the unavailable product from your cart.");
  }
  return new Set((result.data ?? []).filter(p => p.stock_source === "DEFINITEPLAY" || p.stock_source === "FKWALLET" || p.stock_source === "WUPEX").map(p => p.id));
}

export async function supplierAvailableQuantity(optionId: string): Promise<number> {
  const result = await createAdminClient().rpc("supplier_available_quantity", { p_option_id: optionId });
  if (result.error) throw new Error("Unable to verify supplier and uploaded stock.");
  const quantity = Number(result.data);
  return Number.isInteger(quantity) && quantity >= 0 ? Math.min(1000, quantity) : 0;
}
