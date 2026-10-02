export type PriceOption = {
  id: string; name: string; price: number;
  productId: number | null; optionId: number | null; variantId: number | null;
};
export type PriceVariant = {
  variant_id: number; name: Array<{ locale: string; value: string }>;
  type: string; rate: number; is_default: boolean; visible: boolean; order: number;
};
export type PriceParameter = { id: number; type: string; required: boolean; variants: PriceVariant[] };
export type PriceSnapshot = {
  id: number; base: number; currency: string; enabled: boolean; parameters: PriceParameter[];
};
export type PriceRow = { id: string; name: string; website: number; current: number; next: number; productId: number; optionId: number | null; variantId: number | null };
export type PricePlan = { percent: number; rows: PriceRow[]; products: Array<{ before: PriceSnapshot; base: number; rows: PriceRow[] }> };

export function parsePriceAdjustment(value: string) {
  if (!/^[+-]?\d{1,4}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a percentage with up to two decimal places.");
  const percent = Number(value);
  if (percent < -99.99 || percent > 1000) throw new Error("Enter an adjustment between -99.99% and 1000%.");
  return percent;
}

export function cents(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new Error("Invalid price. Prices must be between $0.01 and $1,000,000.");
  return Math.round((value + Number.EPSILON) * 100);
}

export function adjustedPrice(price: number, percent: number) {
  // Integer cents and basis points avoid binary rounding and repeated markups.
  const result = Math.floor((cents(price) * (10000 + Math.round(percent * 100)) + 5000) / 10000);
  if (result < 1 || result > 100000000) throw new Error("The adjustment would produce a price outside $0.01–$1,000,000.");
  return result / 100;
}

function variantPrice(base: number, variant: PriceVariant) {
  if (!Number.isFinite(variant.rate) || variant.rate < 0) throw new Error("Invalid DigiSeller price modifier.");
  switch (variant.type) {
    case "priceplus": return cents(base + variant.rate) / 100;
    case "priceminus": return cents(base - variant.rate) / 100;
    case "percentplus": return cents(base * (1 + variant.rate / 100)) / 100;
    case "percentminus": return cents(base * (1 - variant.rate / 100)) / 100;
    default: throw new Error("Unsupported DigiSeller price modifier.");
  }
}

export function buildPricePlan(options: PriceOption[], snapshots: PriceSnapshot[], rawPercent: string): PricePlan {
  const percent = parsePriceAdjustment(rawPercent);
  if (!options.length) throw new Error("This product has no active denominations.");
  if (options.length > 100) throw new Error("A maximum of 100 denominations can be updated at once.");
  if (options.some(o => !o.productId)) throw new Error("Connect every active denomination to DigiSeller first.");
  const rows: PriceRow[] = [];
  const products: PricePlan["products"] = [];
  for (const id of [...new Set(options.map(o => o.productId!))].sort((a,b) => a-b)) {
    const before = snapshots.find(s => s.id === id);
    if (!before || before.currency !== "USD" || cents(before.base) < 1) throw new Error(`DigiSeller product ${id} must have a valid USD base price.`);
    const mapped = options.filter(o => o.productId === id);
    const parameters = before.parameters;
    if (parameters.length > 1) throw new Error(`Product ${id} has additional parameters. Only a single denomination parameter is supported.`);
    const parameter = parameters[0];
    if (parameter && (!['radio','select'].includes(parameter.type) || !parameter.required)) throw new Error(`Product ${id} must use one required denomination selector.`);
    if (!parameter && (mapped.length !== 1 || mapped[0].optionId || mapped[0].variantId)) throw new Error(`Check the denomination matches for product ${id}.`);
    if (parameter && (mapped.length !== parameter.variants.length || new Set(mapped.map(o => o.variantId)).size !== mapped.length)) throw new Error(`Every DigiSeller denomination of product ${id} must be matched exactly once.`);
    const group = mapped.map(o => {
      const variant = parameter?.variants.find(v => v.variant_id === o.variantId);
      if (parameter && (!variant || parameter.id !== o.optionId)) throw new Error(`Reconnect the DigiSeller denomination for ${o.name}.`);
      if (!Number.isFinite(o.price) || o.price <= 0) throw new Error(`Set a selling price for ${o.name}.`);
      return { id:o.id, name:o.name, website:o.price, current:variant ? variantPrice(before.base,variant) : before.base,
        next:adjustedPrice(o.price,percent), productId:id, optionId:o.optionId, variantId:o.variantId };
    });
    rows.push(...group);
    products.push({ before, base:Math.min(...group.map(r => r.next)), rows:group });
  }
  return {percent,rows,products};
}
