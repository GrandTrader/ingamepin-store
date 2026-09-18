export type ItemRefund = {
  id: string; quantity: number; amount: number | string; currency: string; status: string;
  refund_destination?: string | null; transaction_id?: string | null;
};

export function manualRefundLabel(refunds: ItemRefund[], quantity: number) {
  const manual = refunds.filter(r => r.status === "MANUALLY_REFUNDED").reduce((n, r) => n + r.quantity, 0);
  if (!manual) return null;
  const total = refunds.filter(r => ["CREDITED", "MANUALLY_REFUNDED"].includes(r.status)).reduce((n, r) => n + r.quantity, 0);
  return total >= quantity ? "Manually refunded" : "Partially manually refunded";
}

export function parseManualRefund(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const orderId = text("order_id"), itemId = text("item_id");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(orderId) || !uuid.test(itemId)) throw new Error("Order denomination is invalid.");
  const quantity = Number(text("quantity")), amount = Number(text("amount"));
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) throw new Error("Enter a valid refund quantity.");
  if (!/^\d+(\.\d{1,2})?$/.test(text("amount")) || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) throw new Error("Enter a valid refund amount with at most two decimal places.");
  const destination = text("refund_destination"), transactionId = text("transaction_id"), reason = text("reason");
  if (!["WALLET", "PAYMENT_METHOD"].includes(destination)) throw new Error("Select the refund destination.");
  if (transactionId.length < 3 || transactionId.length > 200) throw new Error("Enter the refund transaction ID.");
  if (reason.length < 3 || reason.length > 500) throw new Error("Enter a refund reason.");
  if (form.get("refund_confirmed") !== "on") throw new Error("Confirm that the customer has already received the refund.");
  return { orderId, itemId, quantity, amount, destination, transactionId, reason };
}
