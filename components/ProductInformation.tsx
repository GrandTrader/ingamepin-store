import { createAdminClient } from "@/lib/supabase/admin";
import ProductDetailsTabs from "./ProductDetailsTabs";
import { importedReviewOrigin, statisticsProductIds } from "@/lib/product-statistics-imports";

// Reviews are supplementary: a slow review query must not delay buying a product.
export default async function ProductInformation(props: {
  productId: string; description: string; descriptionRu?: string | null; deliveryInstructions?: string | null;
}) {
  const admin = createAdminClient();
  const productIds = statisticsProductIds(props.productId);
  const [website, digiseller] = await Promise.all([
    admin.from("order_reviews")
      .select("id, customer_email, sentiment, comment, created_at, orders!inner(order_items!inner(product_id))")
      .in("orders.order_items.product_id", productIds).eq("is_visible", true)
      .order("created_at", { ascending: false }).limit(50),
    admin.from("digiseller_reviews").select("id, digiseller_review_id, product_id, sentiment, comment, reviewed_at")
      .in("product_id", productIds).eq("is_visible", true)
      .order("reviewed_at", { ascending: false }).limit(100),
  ]);
  const reviews = [
    ...(website.error ? [] : website.data ?? []).map(review => {
      const orders = Array.isArray(review.orders) ? review.orders : [review.orders];
      const reviewedProducts = orders.flatMap(order => order?.order_items ?? []).map(item => item.product_id);
      const [name = "Customer"] = String(review.customer_email ?? "").split("@");
      return { id: String(review.id), sentiment: review.sentiment as "POSITIVE" | "NEGATIVE",
        comment: review.comment ? String(review.comment) : null,
        customerLabel: name.length > 2 ? `${name.slice(0, 2)}${"*".repeat(Math.min(name.length - 2, 6))}` : "Verified customer",
        createdAt: String(review.created_at), source: "WEBSITE" as const,
        originalProductName: importedReviewOrigin(props.productId, reviewedProducts) };
    }),
    ...[...new Map((digiseller.error ? [] : digiseller.data ?? [])
      .sort((a, b) => Number(a.product_id === props.productId) - Number(b.product_id === props.productId))
      .map(review => [review.digiseller_review_id, review])).values()].map(review => ({
      id: `digiseller-${review.id}`, sentiment: review.sentiment as "POSITIVE" | "NEGATIVE",
      comment: review.comment ? String(review.comment) : null, customerLabel: "DigiSeller customer",
      createdAt: String(review.reviewed_at), source: "DIGISELLER" as const,
      originalProductName: importedReviewOrigin(props.productId, [review.product_id]),
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
  const positiveCount = reviews.filter(review => review.sentiment === "POSITIVE").length;
  return <ProductDetailsTabs description={props.description} descriptionRu={props.descriptionRu}
    deliveryInstructions={props.deliveryInstructions} reviews={reviews} positiveCount={positiveCount}
    negativeCount={reviews.length - positiveCount} reviewsUnavailable={Boolean(website.error || digiseller.error)} />;
}
