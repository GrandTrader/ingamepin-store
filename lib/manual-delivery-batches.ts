import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
export type ManualDeliveryBatch = { id: string; order_item_id: string; sent_at: string; code_count: number; legacy: boolean; revoked_at: string | null; revoke_reason: string | null };
// The caller must verify administrator access before reading batch history.
export async function getManualDeliveryBatches(admin: ReturnType<typeof createAdminClient>, orderId: string) {
  const batches: ManualDeliveryBatch[] = [];
  for (let offset = 0; ; ) {
    const result = await admin.from("manual_delivery_batches")
      .select("id,order_item_id,sent_at,code_count,legacy,revoked_at,revoke_reason")
      .eq("order_id", orderId).order("sent_at").order("id").range(offset, offset + 499);
    if (result.error) {
      if (["42P01", "PGRST205"].includes(result.error.code)) return { ready: false, batches: [] };
      throw new Error("Unable to load delivery batch history. Please refresh the order.");
    }
    if (!result.data?.length) break;
    batches.push(...result.data);
    offset += result.data.length;
  }
  return { ready: true, batches };
}
