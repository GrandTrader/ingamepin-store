import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type FKWalletProductImport = {
  product_id: string; supplier_category_id: number; markup_percent: number; exchange_rate: number;
};

// Call only after admin authorization. Import ownership is separate from the
// stock source: FKWallet drafts keep manual delivery until fulfillment is ready.
export async function getFKWalletProductImport(productId: string): Promise<FKWalletProductImport | null> {
  const result = await createAdminClient().from("fkwallet_imports")
    .select("product_id,supplier_category_id,markup_percent,exchange_rate").eq("product_id", productId).maybeSingle();
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code)) return null;
    throw new Error("The product supplier could not be checked. Refresh before changing supplier settings.");
  }
  return result.data;
}

export type FKWalletSavedLink = {
  optionId: string; supplierId: number; name: string; cost: number; currency: string;
};
export async function getFKWalletSavedLinks(productId: string): Promise<FKWalletSavedLink[]> {
  const result = await createAdminClient().from("fkwallet_product_links")
    .select("option_id,supplier_product_id,supplier_cost,supplier_currency,supplier_snapshot").eq("product_id", productId);
  if (result.error) throw new Error("The saved FKWallet links could not be loaded. Refresh the page.");
  return (result.data ?? []).map(row => ({ optionId: row.option_id, supplierId: Number(row.supplier_product_id),
    name: typeof row.supplier_snapshot?.name === "string" ? row.supplier_snapshot.name : `FKWallet product #${row.supplier_product_id}`,
    cost: Number(row.supplier_cost), currency: row.supplier_currency }));
}

export async function getFKWalletDeliveryState(productId: string) {
  const db = createAdminClient();
  const [settings, worker, jobs] = await Promise.all([
    db.from("fkwallet_delivery_settings").select("delivery_kind").eq("product_id", productId).maybeSingle(),
    db.from("fkwallet_worker_state").select("seen_at,connection_id").eq("id", true).maybeSingle(),
    db.from("definiteplay_jobs").select("item_id,order_id,state,issue,order_items!inner(product_id)").eq("provider", "FKWALLET").eq("order_items.product_id", productId).order("created_at", { ascending: false }).limit(20),
  ]);
  const ready = !settings.error && !worker.error && !!worker.data && Date.now() - Date.parse(worker.data.seen_at) < 180000 && process.env.FKWALLET_FULFILLMENT_ENABLED?.trim() === "true";
  return { ready, deliveryKind: settings.data?.delivery_kind ?? "CODE", jobs: jobs.data ?? [] };
}
