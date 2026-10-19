export type AdminOrderItem = {
  id: string;
  product_id: string | null;
  product_option_id: string | null;
  product_name: string;
  option_name: string | null;
  denomination: number | null;
  platform: string | null;
  fulfillment_mode: string | null;
  player_id: string | null;
  customer_information: Array<{ fieldId: string; label: string; value: string }>;
  quantity: number;
  affiliate_commission_percent: number | string;
  products: { delivery_type: string } | { delivery_type: string }[] | null;
};

export type AdminOrder = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  order_items: AdminOrderItem[];
};

export function groupOrderItems(items: AdminOrderItem[]) {
  const groups = new Map<string, { key: string; name: string; quantity: number; items: AdminOrderItem[] }>();
  for (const item of items) {
    // Different products can have the same title. Keep their identities separate.
    const key = JSON.stringify([item.product_id, item.product_name]);
    let group = groups.get(key);
    if (!group) {
      group = { key, name: item.product_name, quantity: 0, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
    group.quantity += Number(item.quantity) || 0;
  }
  return [...groups.values()];
}

export function orderItemLabel(item: AdminOrderItem) {
  return item.option_name || (item.denomination != null ? String(item.denomination) : "Standard option");
}

export function orderDeliveryLabel(items: AdminOrderItem[]) {
  const modes = new Set(items.map(item => {
    if (item.fulfillment_mode === "RANGE_MANUAL") return "Manual delivery";
    if (item.fulfillment_mode === "RANGE_SUPPLIER") return "Supplier delivery";
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    if (product?.delivery_type === "MANUAL") return "Manual delivery";
    if (product?.delivery_type === "AUTOMATIC") return "Automatic delivery";
    return null;
  }));
  if (modes.has(null)) return null;
  if (modes.size === 1) return [...modes][0];
  return modes.size > 1 ? "Mixed delivery" : null;
}

export function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DELIVERED: "Completed", PAID: "Paid", PROCESSING: "Processing",
    PAYMENT_REVIEW: "Payment review", PENDING_PAYMENT: "Pending payment",
    CANCELLED: "Cancelled", REFUNDED: "Refunded", TRASHED: "Trash",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}
