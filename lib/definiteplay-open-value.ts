export type OpenValueItem = {
  sku: string;
  name: string;
  brand: string;
  region: string;
  minimum: string;
  maximum: string;
  increment: string;
  currency: string;
  discountPercent: number;
};

export type OpenValueSnapshot = { checkedAt: string; items: OpenValueItem[] };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid catalogue data.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error("Invalid catalogue field.");
  return value.trim();
}
function amount(value: unknown): string {
  const result = text(value);
  if (!/^\d+(?:\.\d{1,6})?$/.test(result) || Number(result) <= 0 || Number(result) > 1e9) {
    throw new Error("Invalid supplier range.");
  }
  return result;
}

// Only expose catalogue fields to the browser, never the source response or credentials.
export function parseOpenValueSnapshot(value: unknown): OpenValueSnapshot {
  const source = record(value);
  const checkedAt = text(source.checkedAt);
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error("Invalid catalogue date.");
  if (source.catalogueStatus !== 200 && source.catalogueStatus !== 201) throw new Error("Catalogue request was not successful.");
  if (!Array.isArray(source.products) || source.products.length > 10000) throw new Error("Invalid product list.");
  const skus = new Set<string>();
  const items = source.products.map(value => {
    const row = record(value);
    const sku = text(row.sku);
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(sku) || skus.has(sku)) throw new Error("Invalid or duplicate supplier code.");
    skus.add(sku);
    const minimum = amount(row.lowerLimit);
    const maximum = amount(row.upperLimit);
    const increment = amount(row.minimumIncrement);
    if (Number(minimum) > Number(maximum)) throw new Error("Invalid supplier range.");
    const currency = text(row.cardCurrency);
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid supplier currency.");
    const discount = text(row.discount);
    if (!/^-?\d+(?:\.\d{1,6})?%$/.test(discount)) throw new Error("Invalid supplier discount.");
    const discountPercent = Number(discount.slice(0, -1));
    if (discountPercent > 100 || discountPercent < -1000) throw new Error("Invalid supplier discount.");
    return { sku, name: text(row.product), brand: text(row.brand), region: text(row.region), minimum, maximum, increment, currency, discountPercent };
  });
  return { checkedAt: new Date(checkedAt).toISOString(), items };
}

export function filterOpenValueItems(items: OpenValueItem[], query: string, region: string, currency: string) {
  const search = query.trim().toLowerCase();
  return items.filter(item => (!region || item.region === region) && (!currency || item.currency === currency) &&
    (!search || [item.name, item.brand, item.sku, item.region, item.currency].some(value => value.toLowerCase().includes(search))));
}

export function formatOpenValueAmount(value: string | number) {
  return Number(value).toLocaleString("en-GB", { maximumFractionDigits: 6 });
}

export function formatOpenValueDiscount(percent: number) {
  if (percent === 0) return "Face value";
  return `${formatOpenValueAmount(Math.abs(percent))}% ${percent < 0 ? "surcharge" : "discount"}`;
}
