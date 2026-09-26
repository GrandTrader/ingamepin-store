import type { UsdtInvoice } from "./usdt-gateway";

export const isReceiptId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function receiptExplorerUrl(network: string, hash: string | null | undefined): string | null {
  if (!hash) return null;
  if (network === "BEP20" && /^0x[0-9a-f]{64}$/i.test(hash)) return `https://bscscan.com/tx/${hash}`;
  if (network === "TRC20" && /^[0-9a-f]{64}$/i.test(hash)) return `https://tronscan.org/#/transaction/${hash}`;
  if (network === "SOLANA" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(hash)) return `https://solscan.io/tx/${hash}`;
  return null;
}

export function matchesReceiptInvoice(invoice: UsdtInvoice, topup: { id: string; gateway_order_id: string | null; gateway_transaction_id: string | null }) {
  return invoice.invoiceId === topup.gateway_order_id && invoice.orderId === topup.id &&
    (!topup.gateway_transaction_id || invoice.transactionHash === topup.gateway_transaction_id);
}
