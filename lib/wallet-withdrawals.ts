export const WITHDRAWAL_NETWORKS = [
  { value: "TRC20", label: "TRON (TRC20)", fee: 4.50 },
  { value: "BEP20", label: "BNB Smart Chain (BEP20)", fee: 0.50 },
  { value: "SOLANA", label: "Solana", fee: 2.50 },
] as const;
export const WITHDRAWAL_SELECT = "id,user_id,amount,network,network_fee,net_usdt,wallet_address,status,transaction_id,reason,reviewed_by,reviewed_at,completed_at,created_at";
export type Withdrawal = {
  id: string; user_id: string; amount: number | string; network: string; network_fee: number | string;
  net_usdt: number | string; wallet_address: string; status: string; transaction_id: string | null;
  reason: string | null; reviewed_by: string | null; reviewed_at: string | null;
  completed_at: string | null; created_at: string;
};
export const WITHDRAWAL_STATUS: Record<string, string> = {
  REQUESTED: "Awaiting approval", APPROVED: "Approved · awaiting manual payout",
  PAID: "Paid", REJECTED: "Rejected · funds released", CANCELLED: "Cancelled · funds released",
};
export function withdrawalQuote(amount: string, network: string) {
  const selected = WITHDRAWAL_NETWORKS.find(item => item.value === network);
  const validAmount = /^\d{1,10}(\.\d{1,2})?$/.test(amount);
  const cents = validAmount ? Math.round(Number(amount) * 100) : 0;
  const feeCents = selected ? Math.round(selected.fee * 100) : 0;
  return { valid: !!selected && validAmount && cents > feeCents && cents <= 999999999999, amount: cents / 100, fee: feeCents / 100, net: Math.max(0, cents - feeCents) / 100 };
}
export function validWithdrawalAddress(network: string, address: string) {
  const patterns: Record<string, RegExp> = {
    TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, BEP20: /^0x[0-9a-fA-F]{40}$/, SOLANA: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  };
  return patterns[network]?.test(address.trim()) ?? false;
}
export function withdrawalDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
