export const CHECKOUT_WINDOW_MS = 15 * 60 * 1000;
export function checkoutDeadline(createdAt: string, expiresAt?: string | null) {
  const deadline = expiresAt ? Date.parse(expiresAt) : Date.parse(createdAt) + CHECKOUT_WINDOW_MS;
  return Number.isFinite(deadline) ? deadline : 0;
}
export const retryPaymentMethods: Record<string, string> = {
  PALLY: "pally", FREEKASSA: "freekassa", BINANCE_PAY: "binance",
  NOWPAYMENTS: "nowpayments", PAYPAL: "paypal", USDT_DIRECT: "usdt", UPI: "manual", WALLET: "wallet",
};
export function retryPaymentPath(method: string) {
  if (method === "USDT_DIRECT") return "/checkout/usdt";
  if (method === "UPI") return "/checkout/manual-usdt";
  return "/checkout/payment";
}
