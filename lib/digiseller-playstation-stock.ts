import "server-only";
import type { createAdminClient } from "./supabase/admin";

// The stock automation is deliberately scoped to the reported owned-code listing.
export const PLAYSTATION_LISTING_ID = 6258900;
export const PLAYSTATION_PRODUCT_ID = "a0127452-de5d-422d-ac83-b811021e572a";
type DB = ReturnType<typeof createAdminClient>;
export type StockOption = {
  id: string; product_id: string; denomination: number | null; is_active: boolean;
  is_in_stock: boolean; is_custom_value: boolean; digiseller_product_id: number;
  digiseller_option_id: number | null; digiseller_variant_id: number | null;
};

export async function playstationStock(db: DB) {
  const [product, options] = await Promise.all([
    db.from("products").select("status,delivery_type,stock_source").eq("id", PLAYSTATION_PRODUCT_ID).single(),
    db.from("product_options").select("id,product_id,denomination,is_active,is_in_stock,is_custom_value,digiseller_product_id,digiseller_option_id,digiseller_variant_id")
      .eq("digiseller_product_id", PLAYSTATION_LISTING_ID).order("id"),
  ]);
  if (product.error || options.error || !product.data || !options.data?.length) throw new Error("PlayStation stock could not be loaded.");
  if (product.data.stock_source !== "OWNED" || product.data.delivery_type !== "AUTOMATIC"
    || options.data.some(o => o.product_id !== PLAYSTATION_PRODUCT_ID || o.is_custom_value)) throw new Error("PlayStation delivery configuration has changed. Review stock sync.");
  return Promise.all((options.data as StockOption[]).map(async option => {
    const result = await db.from("gift_card_codes").select("id", { count: "exact", head: true })
      .eq("product_id", PLAYSTATION_PRODUCT_ID).eq("product_option_id", option.id).eq("status", "AVAILABLE");
    if (result.error || result.count === null) throw new Error("Available voucher codes could not be counted.");
    return { ...option, available: product.data.status === "ACTIVE" && option.is_active && option.is_in_stock !== false ? result.count : 0 };
  }));
}
