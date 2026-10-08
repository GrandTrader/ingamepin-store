import { parseCatalogImport, type CatalogSettings, type CatalogIssue, type CsvRecord } from "./catalog-import";

export type CatalogSnapshot = { product: Record<string, unknown>; options: Record<string, unknown>[]; fields: Record<string, unknown>[] };
export type CatalogCategory = { id: string; name: string; slug: string; category_type: string };
export type CatalogPlanItem = {
  parent_sku: string; expected: CatalogSnapshot | null; product: CsvRecord;
  customer_fields: boolean; rows: number[];
  editions: { sku: string; option_name: string; platform: string; price: string; source: CsvRecord; is_in_stock: boolean; sort_order: number; row: number; warnings: string[] }[];
};
export function buildCatalogPlan(csv: string, mapping: Record<string, string>, settings: CatalogSettings,
  categories: CatalogCategory[], selectedCategoryId: string, snapshots: Record<string, CatalogSnapshot | null>,
  editionOwners: Record<string, string>, now = Date.now()) {
  const parsed = parseCatalogImport(csv, mapping, settings, now);
  const errors: CatalogIssue[] = [...parsed.errors], plan: CatalogPlanItem[] = [];
  const raw = new Map<number, CsvRecord>();
  for (const game of parsed.games) for (const e of game.editions) raw.set(e.row, { parent_sku: game.parent_sku, sku: e.sku, ...game.product, ...e.source, option_name: e.option_name || "", platform: e.platform || "", price: e.price || "" });
  for (const game of parsed.games) {
    try {
      const old = snapshots[game.parent_sku] || null;
      const product: CsvRecord = {};
      const native: Record<string, string> = { title_en: "name", title_ru: "name_ru", description_en: "description", description_ru: "description_ru", slug: "slug", image_url: "image_url", delivery_instructions: "delivery_instructions", is_featured: "is_featured", affiliate_enabled: "affiliate_enabled", affiliate_commission_percent: "affiliate_commission_percent" };
      for (const [key, value] of Object.entries(game.product)) if (native[key]) product[native[key]] = value;
      if (game.product.category_slug || !old) {
        const category = game.product.category_slug ? categories.find(c => c.slug === game.product.category_slug) : categories.find(c => c.id === selectedCategoryId);
        if (!category) throw new Error("Choose an existing category or provide its category_slug.");
        product.category_id = category.id; product.product_type = category.category_type;
      }
      if (!old && (!product.name || !product.slug)) throw new Error("New products require title_en and slug.");
      const affiliateEnabled = product.affiliate_enabled !== undefined ? product.affiliate_enabled === "true" : old?.product.affiliate_enabled === true;
      const affiliateCommission = Number(product.affiliate_commission_percent ?? old?.product.affiliate_commission_percent ?? 0);
      if (affiliateEnabled && affiliateCommission <= 0) throw new Error("An enabled affiliate program requires a commission greater than 0% and at most 25%.");
      const editions: CatalogPlanItem["editions"] = [];
      for (const e of game.editions) {
        try {
          if (editionOwners[e.sku] && editionOwners[e.sku] !== old?.product.id) throw new Error("Edition SKU belongs to another product.");
          const previous = old?.options.find(o => o.catalog_sku === e.sku);
          const option_name = e.option_name || String(previous?.option_name || "");
          const platform = e.platform || String(previous?.platform || "");
          if (!option_name || !platform) throw new Error("New editions require option_name and platform.");
          const source = { ...(previous?.catalog_source as CsvRecord || {}), ...e.source };
          // A new price must be accompanied by fresh verification; never reuse an old check date.
          if (e.store_price_inr && (!e.source.price_checked_at || !e.source.store_url || !e.source.availability)) source.availability = "UNVERIFIED";
          source.availability ||= "UNVERIFIED";
          const verified = ["AVAILABLE", "PREORDER"].includes(source.availability) && Number(source.store_price_inr) > 0 && !!source.store_url && !!source.price_checked_at;
          const unexpired = !source.sale_ends_at || Date.parse(source.sale_ends_at) > now;
          const updateAvailability = !previous || !!e.store_price_inr || "availability" in e.source;
          if (!verified) source.availability = "UNVERIFIED";
          editions.push({ sku: e.sku, option_name, platform, price: e.price || String(previous?.selling_price || "0"), source,
            is_in_stock: verified && unexpired && (updateAvailability || previous?.is_in_stock !== false), sort_order: Number(previous?.sort_order ?? (old?.options.length || 0) + editions.length), row: e.row,
            warnings: [...e.warnings, ...(!verified ? ["Unverified: ordering stays blocked."] : [])] });
        } catch (error) { errors.push({ row: e.row, sku: e.sku, values: raw.get(e.row)!, error: (error as Error).message }); }
      }
      if (editions.length) plan.push({ parent_sku: game.parent_sku, expected: old, product, editions, customer_fields: !old || game.product.customer_fields === "PSN_EMAIL_AND_ID", rows: editions.map(e => e.row) });
    } catch (error) { for (const e of game.editions) errors.push({ row: e.row, sku: e.sku, values: raw.get(e.row)!, error: (error as Error).message }); }
  }
  return { plan, errors, rowCount: parsed.rowCount };
}
