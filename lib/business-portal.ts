export const RESELLER_MONTHLY_USD = 5000;
export function indiaMonth(now = new Date()) {
  const india = new Date(now.getTime() + 330 * 60000);
  const year = india.getUTCFullYear(), month = india.getUTCMonth();
  return { start: new Date(Date.UTC(year, month, 1) - 330 * 60000).toISOString(), end: new Date(Date.UTC(year, month + 1, 1) - 330 * 60000).toISOString(), label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(now) };
}
export type SpendOrder = { id: string; subtotal: number | string; discount: number | string; currency: string; status: string; paid_at: string | null };
export type SpendRefund = { order_id: string; amount: number | string; currency: string; status: string };
export function monthlyBusinessTier(orders: SpendOrder[], refunds: SpendRefund[], now = new Date()) {
  const month = indiaMonth(now);
  const deductions = new Map<string, number>();
  for (const r of refunds) if (r.currency === "USD" && ["CREDITED", "MANUALLY_REFUNDED", "PENDING_CLAIM"].includes(r.status)) deductions.set(r.order_id, (deductions.get(r.order_id) ?? 0) + Math.round(Number(r.amount) * 100));
  let cents = 0;
  for (const o of orders) {
    if (o.currency !== "USD" || !["PAID", "PROCESSING", "DELIVERED"].includes(o.status) || !o.paid_at || Date.parse(o.paid_at) < Date.parse(month.start) || Date.parse(o.paid_at) >= Date.parse(month.end) || !Number.isFinite(Date.parse(o.paid_at))) continue;
    const net = Math.round(Number(o.subtotal) * 100) - Math.round(Number(o.discount ?? 0) * 100) - (deductions.get(o.id) ?? 0);
    if (!Number.isFinite(net)) throw Error("Unable to calculate monthly purchases.");
    cents += Math.max(0, net);
  }
  const spent = cents / 100;
  return { ...month, spent, tier: spent >= RESELLER_MONTHLY_USD ? "Reseller" : "Retailer", remaining: Math.max(0, RESELLER_MONTHLY_USD * 100 - cents) / 100, progress: Math.min(100, spent / RESELLER_MONTHLY_USD * 100) };
}
export function usd(value: number | string) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value)); }
export function portalDate(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
export function csv(rows: unknown[][]) {
  return "\uFEFF" + rows.map(row => row.map(value => { const raw = String(value ?? ""); const safe = /^[\s]*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? "'" + raw : raw; return '"' + safe.replace(/"/g, '""') + '"'; }).join(",")).join("\r\n");
}
export function dateBoundary(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + "T00:00:00+05:30");
  if (!Number.isFinite(time) || new Date(time + 330 * 60000).toISOString().slice(0,10) !== value) return null;
  return new Date(time + (end ? 86400000 : 0)).toISOString();
}
export function portalPage(value?: string) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 && n < 100000 ? n : 1; }
export type PortalProduct = { promotionRules?: import("./product-promotions").PromotionRule[]; id: string; name: string; slug: string; image_url: string | null; region: string; currency: string; is_bulk_order: boolean; delivery_type: string; product_type: string; minimum_quantity: number; maximum_quantity: number | null; stock_quantity: number; allows_player_id_topup: boolean; sold_count: number; categories: { name: string; slug: string } | { name: string; slug: string }[] | null; product_customer_fields: { id: string }[]; product_options: PortalOption[] };
export type PortalOption = { id: string; option_name: string; denomination: number | null; denomination_currency?: string | null; selling_price: number; minimum_quantity: number | null; maximum_quantity: number | null; is_custom_value: boolean; is_active: boolean; is_in_stock: boolean; stock_quantity: number };
export function portalCartItem(product: PortalProduct, option: PortalOption, quantity: number) {
  const minimum = Math.max(1, Number(product.minimum_quantity ?? 1), Number(option.minimum_quantity ?? 1));
  const maximum = product.is_bulk_order ? null : option.maximum_quantity ?? product.maximum_quantity;
  if (!Number.isSafeInteger(quantity) || quantity < minimum || (maximum && quantity > maximum)) throw Error(`Enter a valid quantity for ${product.name} (minimum ${minimum}).`);
  if (product.product_customer_fields.length || product.allows_player_id_topup || product.product_type === "GAME_TOPUP" || option.is_custom_value) throw Error("Open this product to enter the required delivery details.");
  if (!option.is_active || option.is_in_stock === false || !Number.isFinite(Number(option.selling_price)) || Number(option.selling_price) <= 0) throw Error("This option is unavailable.");
  const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  return { id: option.id, cartId: option.id, productId: product.id, productOptionId: option.id, slug: product.slug, categorySlug: category?.slug ?? "", name: product.name, title: product.name, productName: product.name, editionName: option.option_name, denomination: option.denomination ?? option.option_name, denominationCurrency: option.denomination_currency ?? product.currency, amount: option.denomination ?? 0, image: product.image_url, price: Number(option.selling_price), unitPrice: Number(option.selling_price), totalPrice: Number(option.selling_price) * quantity, quantity, minQuantity: minimum, maxQuantity: maximum ?? undefined, isBulkOrder: product.is_bulk_order, productType: product.product_type, deliveryType: product.delivery_type, customerInformation: [] };
}
