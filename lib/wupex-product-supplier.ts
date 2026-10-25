import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
export async function getWupexProductImport(productId: string) {
 const db = createAdminClient();
 const result = await db.from("wupex_imports").select("product_id,markup_percent,pricing_synced_at").eq("product_id", productId).maybeSingle();
 if (result.error && !["42P01", "PGRST205"].includes(result.error.code)) throw new Error("Wupex supplier settings could not be loaded.");
 if (!result.data) return null;
 const [links, jobs] = await Promise.all([
  db.from("wupex_product_links").select("option_id,supplier_product_id,supplier_cost,supplier_snapshot").eq("product_id", productId),
  db.from("definiteplay_jobs").select("item_id,order_id,state,issue,order_items!inner(product_id)").eq("provider", "WUPEX").eq("order_items.product_id", productId).order("created_at", { ascending: false }).limit(20),
 ]);
 if (links.error || jobs.error) throw new Error("Wupex supplier records could not be loaded.");
 return { ...result.data, markup_percent: Number(result.data.markup_percent), links: (links.data ?? []).map(l => ({ optionId: l.option_id, supplierId: Number(l.supplier_product_id), cost: Number(l.supplier_cost), name: String(l.supplier_snapshot.name), sku: String(l.supplier_snapshot.sku) })), jobs: jobs.data ?? [] };
}
