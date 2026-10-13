export const denominationPurchaseLimitMessage =
  "Only one of each denomination is allowed until your purchase limit resets. Check your existing orders or choose a different denomination.";

type DenominationPurchase = {
  optionId: string | null;
  customValue?: unknown;
  quantity: unknown;
};

// A range option may contain several distinct face values. Normalize numeric
// strings so 100, 100.0 and 100.00 cannot be treated as different denominations.
function denominationKey(item: DenominationPurchase) {
  if (!item.optionId) throw new Error("Unable to verify the product denomination.");
  const amount = item.customValue == null ? null : Number(item.customValue);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    throw new Error("Invalid denomination value.");
  }
  return `${item.optionId}:${amount ?? "fixed"}`;
}

export function assertDenominationPurchaseLimit(
  requested: DenominationPurchase[],
  previous: DenominationPurchase[],
) {
  const quantities = new Map<string, number>();
  for (const item of previous) {
    const key = denominationKey(item);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Unable to verify denomination purchase history.");
    quantities.set(key, (quantities.get(key) ?? 0) + quantity);
  }
  for (const item of requested) {
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Invalid denomination quantity.");
    const key = denominationKey(item);
    const total = (quantities.get(key) ?? 0) + quantity;
    if (total > 1) throw new Error(denominationPurchaseLimitMessage);
    quantities.set(key, total);
  }
}
