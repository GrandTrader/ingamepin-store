import "server-only";

import { listDigiSellerReviews, type DigiSellerReview } from "@/lib/digiseller-api";
import { createAdminClient } from "@/lib/supabase/admin";

function sentiment(review: DigiSellerReview): "POSITIVE" | "NEGATIVE" {
  const type = review.type.trim().toLowerCase();
  if (type.includes("bad") || type.includes("neg")) return "NEGATIVE";
  if (type.includes("good") || type.includes("pos")) return "POSITIVE";
  return review.good > 0 ? "POSITIVE" : "NEGATIVE";
}

function reviewedAt(value: string) {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return new Date().toISOString();
  return new Date(Date.UTC(
    Number(match[3]), Number(match[2]) - 1, Number(match[1]),
    Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0),
  )).toISOString();
}

export async function syncDigiSellerReviews() {
  const admin = createAdminClient();
  const mappings = await admin
    .from("product_options")
    .select("product_id, digiseller_product_id")
    .not("digiseller_product_id", "is", null);
  if (mappings.error) throw new Error(`Unable to load DigiSeller mappings: ${mappings.error.message}`);

  const products = new Map<number, Set<string>>();
  for (const mapping of mappings.data ?? []) {
    const externalId = Number(mapping.digiseller_product_id);
    const productId = String(mapping.product_id || "");
    if (!Number.isSafeInteger(externalId) || externalId <= 0 || !productId) continue;
    if (!products.has(externalId)) products.set(externalId, new Set());
    products.get(externalId)!.add(productId);
  }

  let importedReviews = 0;
  let linkedRows = 0;
  for (const [externalId, localProductIds] of products) {
    let page = 1;
    let totalPages = 1;
    do {
      const result = await listDigiSellerReviews(externalId, page, 100);
      totalPages = Math.max(1, result.totalPages);
      const rows = result.reviews.flatMap((review) =>
        Array.from(localProductIds, (productId) => ({
          digiseller_review_id: review.id,
          digiseller_product_id: externalId,
          product_id: productId,
          invoice_id: review.invoiceId,
          marketplace_id: review.ownerId,
          sentiment: sentiment(review),
          product_name: review.name || null,
          comment: review.info || null,
          seller_reply: review.comment || null,
          reviewed_at: reviewedAt(review.date),
          updated_at: new Date().toISOString(),
        })),
      );
      if (rows.length) {
        const saved = await admin.from("digiseller_reviews").upsert(rows, {
          onConflict: "digiseller_review_id,product_id",
        });
        if (saved.error) throw new Error(`Unable to save DigiSeller reviews: ${saved.error.message}`);
        importedReviews += result.reviews.length;
        linkedRows += rows.length;
      }
      page += 1;
    } while (page <= totalPages && page <= 100);
  }

  return { products: products.size, reviews: importedReviews, links: linkedRows };
}
