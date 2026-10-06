export function giftPortDiscount(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,2}(?:\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a supplier discount from 0% to 99.99%, with at most two decimals.");
  return Number(value.trim());
}

// Preview only. The database calculates authoritative costs with decimal arithmetic.
export function giftPortCostPreview(faceValue: number, discount: string, rawRate: number | null) {
  const percent = giftPortDiscount(discount);
  if (rawRate === null || !Number.isFinite(rawRate) || rawRate < 1 || rawRate > 1000 || !Number.isFinite(faceValue) || faceValue <= 0) throw new Error("Save a valid INR exchange rate in Payment Settings first.");
  const inr = faceValue * (1 - percent / 100);
  return { inr, usd: inr / rawRate };
}
