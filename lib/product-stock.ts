export const UNLIMITED_STOCK_QUANTITY = 2_147_483_647;

export function isUnlimitedStock(stockQuantity: number | null | undefined) {
  return Number(stockQuantity) === UNLIMITED_STOCK_QUANTITY;
}
