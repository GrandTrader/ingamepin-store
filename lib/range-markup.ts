// Percentages are kept as scaled integers to avoid rounding the supplier rate early.
export function parseRangeMarkup(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw Error("Enter a markup from 0 to 1000%, with up to two decimal places.");
  const percent = Number(value);
  if (percent < 0 || percent > 1000) throw Error("Enter a markup from 0 to 1000%.");
  return percent;
}
export function supplierRangeRate(discount: number, markup: number) {
  parseRangeMarkup(String(markup));
  if (!Number.isFinite(discount) || discount < -1000 || discount >= 100) throw Error("Invalid supplier discount.");
  const cost = BigInt(100000000) - BigInt(Math.round(discount * 1000000));
  const multiplier = BigInt(10000 + Math.round(markup * 100));
  return Number(cost * multiplier) / 10000000000;
}
export type RangeMarkup = { markup: number; discount: number };
