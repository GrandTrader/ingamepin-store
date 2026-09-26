import { isRestrictionCurrency } from "./purchase-restriction-currencies";

type FaceValueItem = { denomination: unknown; currency: string | null | undefined; quantity: unknown };

// Count face values only in the selected region's currency, never selling prices.
export function regionalFaceValue(items: FaceValueItem[], currency: string): number {
  if (!isRestrictionCurrency(currency)) throw new Error("Unsupported purchase limit currency.");
  let total = 0;
  for (const item of items) {
    if (!item.currency || !isRestrictionCurrency(item.currency)) throw new Error("Unable to verify the denomination currency for this purchase limit. Please contact support.");
    if (item.currency !== currency) continue;
    const amount = typeof item.denomination === "number" || (typeof item.denomination === "string" && item.denomination.trim()) ? Number(item.denomination) : NaN;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Unable to verify the face value for this purchase limit. Please contact support.");
    const thousandths = Math.round(amount * 1000);
    const line = thousandths * quantity;
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(total + line)) throw new Error("Purchase limit value is too large.");
    total += line;
  }
  return total / 1000;
}

export function exceedsRegionalLimit(previous: number, current: number, limit: number): boolean {
  if (![previous, current, limit].every(Number.isFinite) || previous < 0 || current < 0 || limit <= 0) throw new Error("Invalid weekly purchase limit.");
  return Math.round(previous * 1000) + Math.round(current * 1000) > Math.round(limit * 1000);
}
