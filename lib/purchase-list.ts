import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PurchaseIdentity } from "@/lib/purchase-access";
export type PurchaseSummary = { order_number: string; status: string; total: number; currency: string; created_at: string };
export type PurchaseList = { orders: PurchaseSummary[]; page: number; hasMore: boolean; email: string; source: "account" | "guest" };
// Call only after purchaseIdentity and the purchase-read limit. Never cache this result.
export async function readPurchaseList(identity: PurchaseIdentity, page: number): Promise<PurchaseList> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw Error("Invalid page.");
  let query = createAdminClient().from("orders").select("order_number,status,total,currency,created_at");
  query = identity.userId
    ? query.or(`customer_id.eq.${identity.userId},customer_email.eq.${JSON.stringify(identity.email)}`)
    : query.eq("customer_email", identity.email);
  const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20);
  if (result.error) throw Error("Unable to load purchases.");
  return { orders: (result.data ?? []).slice(0, 20), page, hasMore: (result.data?.length ?? 0) > 20, email: identity.email, source: identity.source };
}
