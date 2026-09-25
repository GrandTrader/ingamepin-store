// Presentation only: supplier orders keep their existing fulfillment workflow.
export function hasInstantDelivery(product: {
  stock_source?: string | null;
  delivery_type: string;
  is_bulk_order?: boolean | null;
}) {
  return product.stock_source === "DEFINITEPLAY" ||
    (product.delivery_type === "AUTOMATIC" && !product.is_bulk_order);
}
