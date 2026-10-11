import "server-only";
import { cache } from "react";
import { cataloguePromotions } from "@/lib/product-promotion-data";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { productSearchPages } from "@/lib/product-search-pages";

export const getStoreCategories = cache(unstable_cache(async () => {
  const result = await createAdminClient().from("categories")
    .select("id,public_id,name,short_name,slug,description,image_url,icon")
    .eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (result.error) throw Error("Unable to load store categories.");
  return result.data ?? [];
}, ["store-categories-v1"], { revalidate: 30, tags: ["homepage-store-data"] }));

export const getStoreProducts = cache(unstable_cache(async () => {
  const db = createAdminClient();
  const result = await productSearchPages((from, to) => db.from("products").select(`
    id,public_id,category_id,created_at,name,name_ru,slug,image_url,image_url_ru,price,badge,badge_ru,
    region,stock_quantity,rating,sold_count,product_type,is_featured,is_bulk_order,delivery_type,stock_source,
    categories(name,short_name,slug,public_id),
    product_options(option_name,platform,selling_price,stock_quantity,is_active,is_in_stock)
  `).eq("status", "ACTIVE").eq("retail_enabled", true).eq("is_preorder_only", false)
    .order("is_featured", { ascending: false }).order("sort_order", { ascending: true })
    .order("id", { ascending: true }).range(from, to));
  if (result.error) throw Error("Unable to load store products.");
  return result.data;
}, ["store-products-v1"], { revalidate: 30, tags: ["homepage-store-data"] }));

export async function getStoreOffers() {
  const products = await getStoreProducts();
  return cataloguePromotions(products.map(product => product.id));
}
