import "server-only";

import { listDigiSellerProducts } from "@/lib/digiseller-api";
import { syncDigiSellerReviews } from "@/lib/digiseller-review-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export async function syncDigiSellerStatistics() {
  const admin = createAdminClient();
  const [remoteProducts, mappings] = await Promise.all([
    listDigiSellerProducts(),
    admin
      .from("product_options")
      .select("product_id, digiseller_product_id")
      .not("digiseller_product_id", "is", null),
  ]);

  if (mappings.error) throw new Error(mappings.error.message);

  const remoteById = new Map(remoteProducts.map((product) => [product.id, product]));
  const externalIdsByProduct = new Map<string, Set<number>>();

  for (const mapping of mappings.data ?? []) {
    const externalId = Number(mapping.digiseller_product_id);
    if (!Number.isSafeInteger(externalId) || externalId <= 0) continue;
    if (!externalIdsByProduct.has(mapping.product_id)) {
      externalIdsByProduct.set(mapping.product_id, new Set());
    }
    externalIdsByProduct.get(mapping.product_id)!.add(externalId);
  }

  let productsUpdated = 0;
  let connectedDigiSellerProducts = 0;
  let totalReturns = 0;
  let positiveReviews = 0;
  let negativeReviews = 0;

  for (const [productId, externalIds] of externalIdsByProduct) {
    const statistics = [...externalIds]
      .map((id) => remoteById.get(id))
      .filter((product) => product !== undefined);

    connectedDigiSellerProducts += statistics.length;
    totalReturns += statistics.reduce((total, item) => total + item.returnCount, 0);
    positiveReviews += statistics.reduce((total, item) => total + item.positiveReviewCount, 0);
    negativeReviews += statistics.reduce((total, item) => total + item.negativeReviewCount, 0);
    const result = await admin
      .from("products")
      .update({
        sold_count: statistics.reduce((total, item) => total + item.soldCount, 0),
      })
      .eq("id", productId);

    if (result.error) throw new Error(result.error.message);
    productsUpdated += 1;
  }

  const reviews = await syncDigiSellerReviews();
  return { productsUpdated, connectedDigiSellerProducts, reviews: reviews.reviews, totalReturns, positiveReviews, negativeReviews };
}
