import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Caller supplies the authenticated business customer, never a checkout email.
// Deliberately uncached: quotes and catalogue refreshes must see current discounts.
export async function businessCatalogDiscounts(userId: string, productIds: string[]): Promise<Record<string, number>> {
  const db = createAdminClient(), ids = [...new Set(productIds)];
  const result: Record<string, number> = {};
  for (let start = 0; start < ids.length; start += 500) {
    const response = await db.rpc("get_business_customer_discounts", {p_user:userId,p_products:ids.slice(start,start+500)});
    if (response.error || !Array.isArray(response.data)) throw Error("Unable to load B2B discounts. Please try again.");
    for (const row of response.data) result[row.product_id] = Number(row.discount_percent);
  }
  return result;
}
