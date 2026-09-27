export const REFUND_METHODS = ["WALLET", "BINANCE_PAY", "USDT_DIRECT", "PALLY", "FREEKASSA", "UPI", "PAYTM"] as const;
export function refundMethods(settings: Record<string, { enabled?: boolean }> | null, originalMethod: string) {
  return REFUND_METHODS.filter(method => method === "WALLET" || method === originalMethod ||
    (["UPI", "PAYTM"].includes(method) ? settings?.[method]?.enabled === true : settings?.[method]?.enabled !== false));
}
export function refundId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid order or refund reference.");
  return value;
}
export function parseRefundRequest(form: FormData) {
  const orderId = refundId(form.get("order_id"));
  const method = String(form.get("method") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const details = String(form.get("details") ?? "").trim();
  if (!(REFUND_METHODS as readonly string[]).includes(method)) throw new Error("Choose a refund method.");
  if (reason.length < 3 || reason.length > 1000 || details.length > 1000) throw new Error("Enter a reason between 3 and 1,000 characters and valid refund details.");
  return { orderId, method, reason, details };
}
export const REFUND_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Awaiting admin review", APPROVED: "Approved — awaiting refund transfer",
  COMPLETED: "Refund completed — order cancelled", REJECTED: "Refund request declined",
};
export type OrderRefundRequest = {
  id: string; order_id: string; customer_id: string; amount: number | string; currency: string;
  original_method: string; refund_method: string; payout_details: string; reason: string; status: string;
  admin_note: string; transaction_id: string | null; created_at: string; reviewed_at: string | null; completed_at: string | null;
};
export type RefundEvent = { id: string; request_id: string; status: string; note: string; created_at: string };
