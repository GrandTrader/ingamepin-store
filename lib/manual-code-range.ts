export type ManualCodeRangeDefaults = {
  currency: string; minimum: number; maximum: number; step: number;
  price_basis: number; price_usd: number;
};

type CodeProduct = { product_type: string; stock_source: string | null; delivery_type: string };
type CodeOption = {
  denomination: number | string | null; denomination_currency: string | null;
  selling_price: number | string; is_active: boolean; is_custom_value: boolean;
};

// Use active face values, including temporarily sold-out ones: manual delivery
// does not consume uploaded inventory. Never infer ranges for games or top-ups.
export function manualCodeRangeDefaults(product: CodeProduct, options: CodeOption[]): ManualCodeRangeDefaults | null {
  if (product.product_type !== "GIFT_CARD" || product.stock_source !== "OWNED" || product.delivery_type !== "AUTOMATIC") return null;
  const fixed = options.filter(option => option.is_active && !option.is_custom_value);
  if (fixed.length < 2 || fixed.some(option => !Number.isSafeInteger(Number(option.denomination)) || Number(option.denomination) <= 0
    || Number(option.denomination) > 1000000 || !/^[A-Z]{3}$/.test(option.denomination_currency ?? "")
    || !Number.isFinite(Number(option.selling_price)) || Number(option.selling_price) <= 0 || Number(option.selling_price) > 1000000)) return null;
  const currencies = new Set(fixed.map(option => option.denomination_currency));
  if (currencies.size !== 1) return null;
  const minimum = Math.min(...fixed.map(option => Number(option.denomination)));
  const maximum = Math.max(...fixed.map(option => Number(option.denomination)));
  const smallest = fixed.filter(option => Number(option.denomination) === minimum);
  if (minimum === maximum || new Set(smallest.map(option => Number(option.selling_price))).size !== 1) return null;
  return { currency: smallest[0].denomination_currency!, minimum, maximum, step: 1,
    price_basis: minimum, price_usd: Number(smallest[0].selling_price) };
}
