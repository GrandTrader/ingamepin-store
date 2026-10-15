import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { countProductVisitors, productStatisticsImports, statisticsProductIds } from "./product-statistics-imports";

const cachedVisitorCounts = unstable_cache(async (productId?: string) => {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows: { product_id: string; visitor_hash: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = admin.from("product_views").select("product_id,visitor_hash")
      .gte("last_viewed_at", since).order("id").range(from, from + pageSize - 1);
    if (productId) query = query.in("product_id", statisticsProductIds(productId));
    const result = await query;
    if (result.error) throw new Error("Unable to load product visitors: " + result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < pageSize) break;
  }
  return [...countProductVisitors(rows)];
}, ["product-visitor-counts-v1", JSON.stringify(productStatisticsImports)], { revalidate: 30 });

export async function getProductVisitorCounts(productId?: string) {
  return new Map(await cachedVisitorCounts(productId));
}
