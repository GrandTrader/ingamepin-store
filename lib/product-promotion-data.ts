import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { activePromotion, type ProductPromotion } from "./product-promotions";
import { productRanges } from "./product-range-data";
import { rangePrice } from "./product-range";
export async function productPromotions(ids: string[]) {
  const rows: ProductPromotion[] = [];
  if (!ids.length) return { ready: true, rows };
  // Keep request URLs short while removing serial round trips for large catalogues.
  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += 600) {
    const chunks = [ids.slice(i, i + 200), ids.slice(i + 200, i + 400), ids.slice(i + 400, i + 600)].filter(chunk => chunk.length);
    const results = await Promise.all(chunks.map(chunk => admin.from("product_promotions")
      .select("product_id,revision,rules").in("product_id", chunk)));
    for (const result of results) {
      if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) return { ready: false, rows: [] as ProductPromotion[] };
      if (result.error) throw Error("Unable to load current product discounts.");
      rows.push(...(result.data as ProductPromotion[]));
    }
  }
  return { ready: true, rows };
}
type CatalogueOffers = Map<string, Array<{ price: number; percent: number; endsAt: string | null }>>;

async function cataloguePromotionBatch(batch: ProductPromotion[]): Promise<CatalogueOffers> {
  const options: CatalogueOffers = new Map();
  const ids = batch.map(p => p.product_id);
  const readOptions = (offset: number) => createAdminClient().from("product_options")
    .select("id,product_id,selling_price,is_custom_value,products!inner(allows_custom_value,minimum_custom_value)")
    .in("product_id", ids).eq("is_active", true).order("id").range(offset, offset + 499);
  // Ranges and the first options page are independent reads of current prices.
  const [{ ranges }, firstPage] = await Promise.all([productRanges(ids), readOptions(0)]);
  for (let offset = 0; ; offset += 500) {
    const result = offset === 0 ? firstPage : await readOptions(offset);
    if (result.error) throw Error("Unable to load current product prices.");
    for (const option of result.data ?? []) {
      const range = ranges.find(r => r.option_id === option.id);
      const product = Array.isArray(option.products) ? option.products[0] : option.products;
      let price = Number(option.selling_price);
      if (range) {
        if (!range.enabled) continue;
        price = rangePrice(range, Number(range.minimum));
      } else if (option.is_custom_value) {
        if (!product?.allows_custom_value) continue;
        price = Number(product.minimum_custom_value);
      }
      if (!Number.isFinite(price) || price <= 0) continue;
      const sale = activePromotion(batch.find(p => p.product_id === option.product_id)?.rules, option.id);
      const entries = options.get(option.product_id) ?? [];
      entries.push({ price, percent: sale?.percent ?? 0, endsAt: sale?.endsAt ?? null });
      options.set(option.product_id, entries);
    }
    if ((result.data?.length ?? 0) < 500) break;
  }
  return options;
}

async function readCataloguePromotions(ids: string[]) {
  const promotions = await productPromotions(ids);
  const options: CatalogueOffers = new Map();
  // Limit concurrency to two batches so larger catalogues do not flood the database.
  for (let i = 0; i < promotions.rows.length; i += 200) {
    const batches = [promotions.rows.slice(i, i + 100), promotions.rows.slice(i + 100, i + 200)]
      .filter(batch => batch.length);
    const results = await Promise.all(batches.map(cataloguePromotionBatch));
    for (const result of results) for (const [id, offers] of result) options.set(id, offers);
  }
  return options;
}

// Cache only public catalogue prices. Personal discounts and checkout validation stay live.
// Admin price edits revalidate the root layout; channel/bulk edits also clear this tag.
const getCachedCatalogueOffers = unstable_cache(async (ids: string[]) =>
  Array.from(await readCataloguePromotions(ids)),
  ["catalogue-promotion-prices-v1"],
  { revalidate: 30, tags: ["homepage-store-data"] },
);

export async function cataloguePromotions(ids: string[]) {
  if (!ids.length) return new Map() as CatalogueOffers;
  return new Map(await getCachedCatalogueOffers([...new Set(ids)].sort()));
}
