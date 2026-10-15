// Historical statistics shared at the owner's request. Original orders, reviews,
// visitor timestamps and supplier mappings remain attached to their original product.
export const productStatisticsImports = [{
  sourceId: "ca5fb330-f083-46fe-b27a-31a6d98af545", // 874868357
  targetId: "cc01341d-8304-4617-8a45-ced34f2efc1c", // 874868346
  sourceName: "Apple India Bulk Order",
}] as const;

export function statisticsProductIds(productId: string): string[] {
  return [...new Set([productId, ...productStatisticsImports
    .filter(link => link.targetId === productId).map(link => link.sourceId)])];
}

export function statisticsDestinations(productId: string): string[] {
  return [...new Set([productId, ...productStatisticsImports
    .filter(link => link.sourceId === productId).map(link => link.targetId)])];
}

// Each target's own external count is already added by its caller. Include only
// the imported products' external counts here, without changing the source totals.
export function mergeImportedProductSales(
  sales: ReadonlyMap<string, number>, externalSales: ReadonlyMap<string, number>,
): Map<string, number> {
  const combined = new Map(sales);
  for (const targetId of new Set(productStatisticsImports.map(link => link.targetId))) {
    const imported = statisticsProductIds(targetId).filter(id => id !== targetId)
      .reduce((total, id) => total + (sales.get(id) ?? 0) + (externalSales.get(id) ?? 0), 0);
    combined.set(targetId, (sales.get(targetId) ?? 0) + imported);
  }
  return combined;
}

export function importedReviewOrigin(productId: string, reviewedProductIds: string[]): string | undefined {
  if (reviewedProductIds.includes(productId)) return undefined;
  return productStatisticsImports.find(link => link.targetId === productId
    && reviewedProductIds.includes(link.sourceId))?.sourceName;
}

export function countProductVisitors(rows: { product_id: string; visitor_hash: string }[]): Map<string, number> {
  const visitors = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const destination of statisticsDestinations(row.product_id)) {
      if (!visitors.has(destination)) visitors.set(destination, new Set());
      visitors.get(destination)!.add(row.visitor_hash);
    }
  }
  return new Map([...visitors].map(([id, hashes]) => [id, hashes.size]));
}
