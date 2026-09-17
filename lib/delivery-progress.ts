type DeliveryItem = { quantity: number; fulfillment_mode?: string | null; service_delivered_at?: string | null };
export function deliveredUnits(item: DeliveryItem, codeCount: number, orderStatus: string): number {
  if (item.service_delivered_at || (item.fulfillment_mode === "PLAYER_ID_TOPUP" && orderStatus === "DELIVERED")) return item.quantity;
  return Math.min(item.quantity, Math.max(0, codeCount));
}
