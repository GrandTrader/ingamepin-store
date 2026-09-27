export const REFUND_METHODS = ["WALLET", "BINANCE_PAY", "USDT_DIRECT", "PALLY", "FREEKASSA", "UPI", "PAYTM"] as const;
export const CRYPTO_REFUND_NETWORKS = [
  { value: "TRC20", label: "TRON (TRC20)", feeUsd: 4.5 },
  { value: "BEP20", label: "BNB Smart Chain (BEP20)", feeUsd: 0.5 },
  { value: "SOLANA", label: "Solana", feeUsd: 2.5 },
  { value: "OTHER", label: "Other crypto network", feeUsd: 3.5 },
] as const;
export function refundQuote(amount: number, currency: string, method: string, network: string) {
  const selected = CRYPTO_REFUND_NETWORKS.find(option => option.value === network);
  if (method === "USDT_DIRECT" && !selected) return { fee: 0, net: amount, error: "Select a crypto refund network." };
  if (method === "USDT_DIRECT" && currency !== "USD") return { fee: 0, net: amount, error: "Crypto refunds require an order in USD. Choose another refund method or contact support." };
  const fee = method === "USDT_DIRECT" ? selected!.feeUsd : 0;
  const net = (Math.round(amount * 100) - Math.round(fee * 100)) / 100;
  return { fee, net, error: !Number.isFinite(net) || net <= 0 ? "The refund amount must be greater than the network fee. Choose another refund method." : "" };
}
export function refundMethods(settings: Record<string, { enabled?: boolean }> | null, originalMethod: string) {
  const cryptoMethods: readonly string[] = ["BINANCE_PAY", "USDT_DIRECT"];
  return REFUND_METHODS.filter(method => {
    if (method === "WALLET" || method === originalMethod) return true;
    return cryptoMethods.includes(originalMethod) && cryptoMethods.includes(method) && settings?.[method]?.enabled !== false;
  });
}
export function refundId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid order or refund reference.");
  return value;
}
export function parseRefundRequest(form: FormData) {
  const orderId = refundId(form.get("order_id"));
  const method = String(form.get("method") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const network = method === "USDT_DIRECT" ? String(form.get("network") ?? "") : "";
  let details = String(form.get("details") ?? "").trim();
  if (!(REFUND_METHODS as readonly string[]).includes(method)) throw new Error("Choose a refund method.");
  if (reason.length < 3 || reason.length > 1000 || details.length > 1000) throw new Error("Enter a reason between 3 and 1,000 characters and valid refund details.");
  if (method === "USDT_DIRECT") {
    const selectedNetwork = CRYPTO_REFUND_NETWORKS.find(option => option.value === network);
    if (!selectedNetwork) throw new Error("Select a crypto refund network.");
    const address = String(form.get("wallet_address") ?? "").trim();
    const patterns: Record<string, RegExp> = {
      TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
      BEP20: /^0x[0-9a-fA-F]{40}$/,
      SOLANA: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    };
    const otherNetwork = String(form.get("other_network") ?? "").trim();
    if (network === "OTHER" && !/^[a-zA-Z0-9][a-zA-Z0-9 ()._-]{1,59}$/.test(otherNetwork)) throw new Error("Enter the crypto network name (2–60 characters).");
    if (network === "OTHER" && /\b(TRON|TRC[ -]?20|SOLANA|SOL|BSC|BEP[ -]?20|BNB)\b/i.test(otherNetwork)) throw new Error("Select TRON, Solana or BNB Smart Chain directly from the network list.");
    // Format checks do not verify ownership or that a receiving exchange supports USDT.
    if (network === "OTHER" ? !/^[a-zA-Z0-9:_-]{10,150}$/.test(address) : !patterns[network].test(address)) throw new Error(`Enter a valid wallet address format for ${selectedNetwork.label}.`);
    details = `Network: ${network === "OTHER" ? otherNetwork : selectedNetwork.label}\nWallet address: ${address}`;
  }
  return { orderId, method, reason, details, network };
}
export const REFUND_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Awaiting admin review", APPROVED: "Approved — awaiting refund transfer",
  COMPLETED: "Refund completed — order cancelled", REJECTED: "Refund request declined",
};
export type OrderRefundRequest = {
  id: string; order_id: string; customer_id: string; amount: number | string; currency: string;
  network_fee?: number | string; net_amount?: number | string; crypto_network?: string | null;
  original_method: string; refund_method: string; payout_details: string; reason: string; status: string;
  admin_note: string; transaction_id: string | null; created_at: string; reviewed_at: string | null; completed_at: string | null;
};
export type RefundEvent = { id: string; request_id: string; status: string; note: string; created_at: string };
