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
  return new Set((result.data ?? []).filter(p => p.stock_source === "DEFINITEPLAY").map(p => p.id));
}

export async function supplierAvailableQuantity(optionId: string): Promise<number> {
  const result = await createAdminClient().from("definiteplay_stock")
    .select("available_quantity,synced_at,unit_cost").eq("option_id", optionId).maybeSingle();
  if (result.error) throw new Error("Unable to verify supplier stock.");
  const row = result.data;
  const age = row ? Date.now() - Date.parse(row.synced_at) : NaN;
  return row && Number.isFinite(age) && age >= -60000 && age < 15 * 60000 && Number(row.unit_cost) > 0
    ? Math.max(0, Math.min(1000, Number(row.available_quantity))) : 0;
}
