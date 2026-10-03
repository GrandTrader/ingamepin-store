export type AffiliateProduct = {
  id: string;
  name: string;
  status: string;
  category_id: string | null;
  region: string | null;
  affiliate_enabled: boolean;
  affiliate_commission_percent: number | string;
};

export type AffiliateProductFilters = {
  search: string;
  category: string;
  region: string;
  status: string;
  affiliate: string;
};

export function filterAffiliateProducts(products: AffiliateProduct[], filters: AffiliateProductFilters) {
  const search = filters.search.trim().toLowerCase();
  return products.filter((product) =>
    (!search || product.name.toLowerCase().includes(search)) &&
    (!filters.category || product.category_id === filters.category) &&
    (!filters.region || (product.region || "Global") === filters.region) &&
    (!filters.status || product.status === filters.status) &&
    (!filters.affiliate || product.affiliate_enabled === (filters.affiliate === "ENABLED")),
  );
}

export type AffiliateProductChange = { id: string; enabled: boolean; commission: number };

export function parseAffiliateProductChanges(input: unknown): AffiliateProductChange[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 5000) {
    throw new Error("Choose between 1 and 5,000 displayed products to save.");
  }
  const ids = new Set<string>();
  return input.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid product settings.");
    const { id, enabled, commission } = value;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Invalid product information.");
    }
    const normalizedId = id.toLowerCase();
    if (ids.has(normalizedId)) throw new Error("A product was included more than once.");
    ids.add(normalizedId);
    if (typeof enabled !== "boolean" || typeof commission !== "number" || !Number.isFinite(commission) ||
        commission < 0 || commission > 25 || Math.abs(commission * 100 - Math.round(commission * 100)) > 0.0000001) {
      throw new Error("Commission must be between 0% and 25%, with up to two decimal places.");
    }
    if (enabled && commission === 0) throw new Error("Set a commission above 0% for every enabled product.");
    return { id: normalizedId, enabled, commission };
  });
}
