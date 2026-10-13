// Presentation only: supplier orders keep their existing fulfillment workflow.
export function hasInstantDelivery(product: {
  stock_source?: string | null;
  delivery_type: string;
  is_bulk_order?: boolean | null;
}) {
  if (product.stock_source === "GIFTPORT") return false;
  return product.stock_source === "DEFINITEPLAY" || product.stock_source === "FKWALLET" ||
    (product.delivery_type === "AUTOMATIC" && !product.is_bulk_order);
}
