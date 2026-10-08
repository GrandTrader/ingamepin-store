import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { activePromotion, type ProductPromotion } from "./product-promotions";
import { productRanges } from "./product-range-data";
import { rangePrice } from "./product-range";
export async function productPromotions(ids: string[]) {
  const rows: ProductPromotion[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const result = await createAdminClient().from("product_promotions").select("product_id,revision,rules").in("product_id", ids.slice(i, i + 200));
    if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) return { ready: false, rows: [] as ProductPromotion[] };
    if (result.error) throw Error("Unable to load current product discounts.");
    rows.push(...(result.data as ProductPromotion[]));
  }
  return { ready: true, rows };
}
export async function cataloguePromotions(ids: string[]) {
  const promotions = await productPromotions(ids);
  const options = new Map<string, Array<{ price: number; percent: number; endsAt: string | null }>>();
  if (!promotions.rows.length) return options;
  for (let i = 0; i < promotions.rows.length; i += 100) {
    const batch = promotions.rows.slice(i, i + 100);
    const ids = batch.map(p => p.product_id);
    const { ranges } = await productRanges(ids);
    for (let offset = 0; ; offset += 500) {
      const result = await createAdminClient().from("product_options")
        .select("id,product_id,selling_price,is_custom_value,products!inner(allows_custom_value,minimum_custom_value)")
        .in("product_id", ids).eq("is_active", true).order("id").range(offset, offset + 499);
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
  }
  return options;
}
