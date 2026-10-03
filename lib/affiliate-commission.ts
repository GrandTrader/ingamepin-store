/** A promoter-specific limit may lower, but never exceed, the product maximum. */
export function affiliateCommissionLimit(
  productMaximum: number | string,
  promoterMaximum?: number | string | null,
): number {
  const product = Number(productMaximum);
  const promoter = promoterMaximum == null ? product : Number(promoterMaximum);
  if (!Number.isFinite(product) || !Number.isFinite(promoter)) return 0;
  return Math.max(0, Math.min(25, product, promoter));
}
