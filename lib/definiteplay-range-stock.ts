import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
export async function supplierRangeLimits(optionIds: string[]): Promise<Map<string, number>> {
  if (!optionIds.length) return new Map();
  const result = await createAdminClient().rpc("definiteplay_range_limits", { p_option_ids: optionIds });
  if (result.error || !Array.isArray(result.data)) return new Map();
  return new Map(result.data.filter((row: {optionId?: unknown; quantity?: unknown}) => typeof row.optionId === "string" && Number.isInteger(row.quantity) && Number(row.quantity) >= 0 && Number(row.quantity) <= 1000).map((row: {optionId: string; quantity: number}) => [row.optionId, row.quantity]));
}
