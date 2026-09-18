type StockItem = { productId?: string; productOptionId?: string; quantity: number };
export function quantityForOption(items: StockItem[], optionId: string) {
  return items.filter(item => item.productOptionId === optionId).reduce((sum, item) => sum + Number(item.quantity), 0);
}
export async function validateCartStock(items: StockItem[]) {
  if (!items.length) throw new Error('Your cart is empty.');
  if (items.some(item => !item.productId || !item.productOptionId || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('The cart quantity is invalid.');
  const unique = [...new Map(items.map(item => [item.productOptionId, item])).values()];
  const response = await fetch('/api/products/quantity-limits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: unique }), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result.limits)) throw new Error(result.error || 'Unable to check stock. Please try again.');
  for (const item of unique) {
    const limit = result.limits.find((entry: { productOptionId: string }) => entry.productOptionId === item.productOptionId);
    if (!limit) throw new Error('Unable to check stock. Please try again.');
    const total = quantityForOption(items, item.productOptionId!);
    if (limit.availableQuantity != null && total > limit.availableQuantity) throw new Error('Only ' + limit.availableQuantity + ' code(s) are available for this denomination. Your selected total is ' + total + '.');
  }
}
