const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UPI: "Manual payment",
  USDT_DIRECT: "Direct USDT",
  BINANCE_PAY: "Binance Pay",
  FREEKASSA: "FreeKassa",
  PALLY: "Pally Payment",
  WALLET: "InGamePin Wallet",
};

export function formatPaymentMethod(method: string | null | undefined) {
  if (!method) return "—";
  const normalized = method.trim().toUpperCase();
  return PAYMENT_METHOD_LABELS[normalized] ?? method.replaceAll("_", " ");
}
