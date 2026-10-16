import { parseRangeMarkup } from "./range-markup";

export type LinkedRangePricing = {
  linked: boolean;
  manualBasePrice: number | null;
  manualMarkup: number;
};
export type RangePriceOption = {
  id: string; name: string; denomination: number; currency: string; sellingPrice: number;
  supplierCost?: number | null;
};

// Decimal arithmetic: round the final selling price only, matching PostgreSQL.
export function markedUpRate(base: number, markup: number) {
  parseRangeMarkup(String(markup));
  if (!Number.isFinite(base) || base <= 0 || base > 1000000) throw Error("Enter a valid base price.");
  return Number(BigInt(base.toFixed(10).replace(".", "")) * BigInt(10000 + Math.round(markup * 100))) / 1e14;
}

export function linkedDenominationPrice(value: number, basis: number, rate: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 2147483647 || !Number.isInteger(basis) || basis <= 0 ||
      !Number.isFinite(rate) || rate <= 0 || rate > 1000000) throw Error("Check the denomination and pricing basis.");
  const numerator = BigInt(value.toFixed(4).replace(".", "")) * BigInt(rate.toFixed(10).replace(".", "")) * BigInt(100);
  const denominator = BigInt(basis) * BigInt(10000) * BigInt(10000000000);
  const price = Number((numerator + denominator - BigInt(1)) / denominator) / 100;
  if (price <= 0 || price > 9999999999.99) throw Error("Selling price is outside the supported range.");
  return price;
}

export function linkedSupplierPrice(cost: number, markup: number) {
  parseRangeMarkup(String(markup));
  if (!Number.isFinite(cost) || cost <= 0 || cost > 1000000) throw Error("Supplier cost is unavailable.");
  const numerator=BigInt(cost.toFixed(8).replace(".",""))*BigInt(10000+Math.round(markup*100))*BigInt(100);
  const denominator=BigInt(100000000)*BigInt(10000);
  return Number((numerator+denominator-BigInt(1))/denominator)/100;
}
