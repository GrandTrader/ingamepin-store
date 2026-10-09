import { catalogCsv, decimalUnits, readCatalogCsv, type CsvRecord } from "./catalog-import";
import { activePromotion, discountedPrice, fromIndiaInput, toIndiaInput, type ProductPromotion, type PromotionRule } from "./product-promotions";

export const PRICE_COLUMNS = ["product_id", "option_id", "product_name", "option_name", "regular_price_usd", "discount_percent", "discount_expires_at", "store_regular_price_inr", "store_url", "price_checked_at"] as const;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type PriceRow = { row: number; productId: string; optionId: string; price?: string; rule?: PromotionRule; source?: CsvRecord; values: CsvRecord };
export type PriceIssue = { row: number; error: string; values: CsvRecord };
export type PriceSnapshot = {
  product: { id: string; name: string; price: number | string; currency: string; status: string; stock_source?: string; updated_at: string };
  options: { id: string; option_name: string; selling_price: number | string; is_custom_value: boolean; is_active: boolean; catalog_source: CsvRecord | null; updated_at: string }[];
  promotion: (ProductPromotion & { updated_at: string }) | null;
  range_options: string[]; seller_managed: boolean;
};
export type PricePlan = { product_id: string; parent_sku: string; expected: PriceSnapshot; rows: PriceRow[] };
export function priceExpiry(value: string): string {
  const local = value.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return fromIndiaInput(local);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(local) || !Number.isFinite(Date.parse(local))) throw Error("Use YYYY-MM-DD HH:mm (IST), or an ISO date with timezone.");
  const day = local.slice(0, 10);
  if (new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) throw Error("Invalid calendar date.");
  return new Date(local).toISOString();
}
export function priceSourceUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.search && !u.hash &&
      ((u.hostname === "store.playstation.com" && /^\/en-in\/(product\/[A-Z0-9_-]+|concept\/\d+)\/?$/i.test(u.pathname)) ||
       (u.hostname === "www.xbox.com" && /^\/en-in\/games\/store\/[a-z0-9-]+\/[a-z0-9]{12}\/?$/i.test(u.pathname)));
  } catch { return false; }
}
export function parsePriceImport(csv: string, now = Date.now()) {
  const cells = readCatalogCsv(csv), headers = cells[0].map(h => h.toLowerCase().trim());
  if (new Set(headers).size !== headers.length || headers.some(h => !PRICE_COLUMNS.includes(h as typeof PRICE_COLUMNS[number]) && !["row", "error"].includes(h))) throw Error("Use the Prices & discounts CSV template. Unsupported or duplicate column found.");
  if (!["product_id", "option_id"].every(h => headers.includes(h))) throw Error("The CSV needs product_id and option_id columns. Download existing prices to get these IDs.");
  const raw = cells.slice(1).map((r, i) => ({ values: Object.fromEntries(headers.map((h, j) => [h, r[j] || ""])), row: i + 2, cells: r }));
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const r of raw) { const id = r.values.option_id.toLowerCase(); if (seen.has(id)) duplicates.add(id); seen.add(id); }
  const rows: PriceRow[] = [], errors: PriceIssue[] = [];
  for (const { values: v, row, cells: fields } of raw) try {
    if (fields.length !== headers.length) throw Error("Column count differs from the header.");
    if (!uuid.test(v.product_id) || !uuid.test(v.option_id)) throw Error("Use the existing product_id and option_id from the price export.");
    if (duplicates.has(v.option_id.toLowerCase())) throw Error("This option appears more than once. Every duplicate is rejected.");
    const item: PriceRow = { row, productId: v.product_id.toLowerCase(), optionId: v.option_id.toLowerCase(), values: v };
    if (v.regular_price_usd) {
      const cents = decimalUnits(v.regular_price_usd, 2, "Regular USD price");
      if (cents < BigInt(1) || cents > BigInt(100000000)) throw Error("Regular price must be $0.01–$1,000,000.");
      item.price = (Number(cents) / 100).toFixed(2);
    }
    if (v.discount_percent) {
      const basis = decimalUnits(v.discount_percent, 2, "Discount");
      if (basis >= BigInt(10000)) throw Error("Discount must be 0–99.99%.");
      const percent = Number(basis) / 100;
      if (percent === 0 && v.discount_expires_at) throw Error("Leave expiry blank when discount is 0.");
      const endsAt = percent > 0 ? priceExpiry(v.discount_expires_at || "") : null;
      if (endsAt && (Date.parse(endsAt) <= now || Date.parse(endsAt) > now + 3660 * 86400000)) throw Error("Discount expiry must be in the future and within ten years.");
      item.rule = { optionId: item.optionId, percent, endsAt };
    } else if (v.discount_expires_at) throw Error("Enter discount_percent with the expiry date.");
    if ([v.store_regular_price_inr, v.store_url, v.price_checked_at].some(Boolean)) {
      if (![v.store_regular_price_inr, v.store_url, v.price_checked_at].every(Boolean)) throw Error("Store verification needs store_regular_price_inr, store_url and price_checked_at together.");
      const amount = decimalUnits(v.store_regular_price_inr, 2, "Regular INR store price");
      if (amount <= BigInt(0) || amount > BigInt(100000000)) throw Error("Regular store price must be ₹0.01–₹1,000,000.");
      if (!priceSourceUrl(v.store_url)) throw Error("Use the official India PlayStation or Xbox product URL.");
      const checked = priceExpiry(v.price_checked_at);
      if (Date.parse(checked) > now + 300000 || Date.parse(checked) < now - 7 * 86400000) throw Error("Verify the official store price within the last seven days.");
      if (!item.price) throw Error("Supply the regular USD price when refreshing store-price verification.");
      // A verified regular price remains the purchase basis when the separate promotion expires.
      item.source = { store_price_inr: (Number(amount) / 100).toFixed(2), store_url: v.store_url, price_checked_at: checked, sale_ends_at: "" };
    }
    if (!item.price && !item.rule) throw Error("Enter a regular price or discount. Blank fields preserve existing settings.");
    rows.push(item);
  } catch (e) { errors.push({ row, values: v, error: (e as Error).message }); }
  return { rows, errors, rowCount: raw.length };
}
export function buildPricePlan(csv: string, snapshots: Record<string, PriceSnapshot | null>, now = Date.now()) {
  const parsed = parsePriceImport(csv, now), errors = [...parsed.errors], plans = new Map<string, PricePlan>();
  const preview: { row: number; product: string; option: string; previous: number; regular: number; sale: number; percent: number; expires: string | null; warning: string }[] = [];
  for (const row of parsed.rows) try {
    const old = snapshots[row.productId];
    if (!old) throw Error("Product not found. This uploader only updates existing products.");
    if (old.seller_managed) throw Error("Use the seller's price editor for seller-managed listings.");
    if (old.product.currency !== "USD") throw Error("This uploader accepts products priced in USD.");
    const option = old.options.find(o => o.id === row.optionId);
    if (!option) throw Error("The option does not belong to this product.");
    if (option.is_custom_value || old.range_options.includes(option.id)) throw Error("Use the range editor for variable-value options. This uploader updates fixed denominations.");
    if (row.source && (!option.catalog_source || !["AVAILABLE", "PREORDER"].includes(option.catalog_source.availability))) throw Error("Store verification can refresh an existing verified catalogue option only.");
    if (row.source && option.catalog_source?.store_url !== row.source.store_url) throw Error("Store URL differs from this edition's saved source. Review it in the product editor first.");
    const rules = [...(old.promotion?.rules || [])];
    if (row.rule) { const index = rules.findIndex(r => r.optionId === row.optionId); if (index < 0) rules.push(row.rule); else rules[index] = row.rule; }
    const previousRule = activePromotion(old.promotion?.rules, option.id, now), nextRule = activePromotion(rules, option.id, now);
    const regular = Number(row.price ?? option.selling_price);
    if (!Number.isFinite(regular) || regular <= 0) throw Error("Set a positive regular price before applying a discount.");
    let plan = plans.get(row.productId);
    if (!plan) { plan = { product_id: row.productId, parent_sku: row.productId, expected: old, rows: [] }; plans.set(row.productId, plan); }
    plan.rows.push(row);
    preview.push({ row: row.row, product: old.product.name, option: option.option_name, previous: discountedPrice(Number(option.selling_price), previousRule?.percent || 0), regular, sale: discountedPrice(regular, nextRule?.percent || 0), percent: nextRule?.percent || 0, expires: nextRule?.endsAt || null,
      warning: [old.product.stock_source === "DEFINITEPLAY" && row.price ? "Supplier sync may replace this regular price." : "", !option.is_active || old.product.status !== "ACTIVE" ? "Product or option is not active." : "", option.catalog_source?.sale_ends_at && !row.source ? `Existing store-price verification expires at ${option.catalog_source.sale_ends_at}. Supply fresh regular store-price verification to keep purchases available afterward.` : ""].filter(Boolean).join(" ") });
  } catch (e) { errors.push({ row: row.row, values: row.values, error: (e as Error).message }); }
  for (const plan of plans.values()) {
    const ids = new Set((plan.expected.promotion?.rules || []).map(r => String(r.optionId)));
    for (const row of plan.rows) if (row.rule) ids.add(row.optionId);
    if (ids.size > 201) errors.push({ row: plan.rows[0].row, values: plan.rows[0].values, error: "A product supports at most 201 discount rules." });
  }
  return { plan: [...plans.values()], errors, preview, rowCount: parsed.rowCount };
}
export function priceImportTemplate() {
  return catalogCsv(PRICE_COLUMNS, [["COPY_PRODUCT_ID", "COPY_OPTION_ID", "Existing product", "Existing denomination", "10.00", "20", toIndiaInput(new Date(Date.now() + 30 * 86400000).toISOString()).replace("T", " "), "", "", ""]]);
}
