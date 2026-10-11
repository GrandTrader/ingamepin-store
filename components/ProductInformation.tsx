import { createAdminClient } from "@/lib/supabase/admin";
import ProductDetailsTabs from "./ProductDetailsTabs";

// Reviews are supplementary: a slow review query must not delay buying a product.
export default async function ProductInformation(props: {
  productId: string; description: string; descriptionRu?: string | null; deliveryInstructions?: string | null;
}) {
  const admin = createAdminClient();
  const [website, digiseller] = await Promise.all([
    admin.from("order_reviews")
      .select("id, customer_email, sentiment, comment, created_at, orders!inner(order_items!inner(product_id))")
      .eq("orders.order_items.product_id", props.productId).eq("is_visible", true)
      .order("created_at", { ascending: false }).limit(50),
    admin.from("digiseller_reviews").select("id, sentiment, comment, reviewed_at")
      .eq("product_id", props.productId).eq("is_visible", true)
      .order("reviewed_at", { ascending: false }).limit(100),
  ]);
  const reviews = [
    ...(website.error ? [] : website.data ?? []).map(review => {
      const [name = "Customer"] = String(review.customer_email ?? "").split("@");
      return { id: String(review.id), sentiment: review.sentiment as "POSITIVE" | "NEGATIVE",
        comment: review.comment ? String(review.comment) : null,
        customerLabel: name.length > 2 ? `${name.slice(0, 2)}${"*".repeat(Math.min(name.length - 2, 6))}` : "Verified customer",
        createdAt: String(review.created_at), source: "WEBSITE" as const };
    }),
    ...(digiseller.error ? [] : digiseller.data ?? []).map(review => ({
      id: `digiseller-${review.id}`, sentiment: review.sentiment as "POSITIVE" | "NEGATIVE",
      comment: review.comment ? String(review.comment) : null, customerLabel: "DigiSeller customer",
      createdAt: String(review.reviewed_at), source: "DIGISELLER" as const,
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
  const positiveCount = reviews.filter(review => review.sentiment === "POSITIVE").length;
  return <ProductDetailsTabs description={props.description} descriptionRu={props.descriptionRu}
    deliveryInstructions={props.deliveryInstructions} reviews={reviews} positiveCount={positiveCount}
    negativeCount={reviews.length - positiveCount} reviewsUnavailable={Boolean(website.error || digiseller.error)} />;
}
