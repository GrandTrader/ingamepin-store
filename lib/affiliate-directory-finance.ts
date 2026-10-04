export type PromoterFinance = {
  earnedCents: number;
  availableCents: number;
  pendingCents: number;
  heldCents: number;
  paidOutCents: number;
  pendingPayoutCents: number;
  latestPayout: { status: string; netCents: number; date: string; network: string } | null;
};

export function emptyPromoterFinance(): PromoterFinance {
  return {
    earnedCents: 0, availableCents: 0, pendingCents: 0, heldCents: 0,
    paidOutCents: 0, pendingPayoutCents: 0, latestPayout: null,
  };
}

export function addPromoterCommission(finance: PromoterFinance, row: { status: string; commission_amount: number | string }) {
  const cents = Math.round(Number(row.commission_amount) * 100);
  if (["PENDING", "AVAILABLE", "REQUESTED", "PAID"].includes(row.status)) finance.earnedCents += cents;
  if (row.status === "AVAILABLE") finance.availableCents += cents;
  if (row.status === "PENDING") finance.pendingCents += cents;
  if (row.status === "HELD") finance.heldCents += cents;
}

export function addPromoterPayout(finance: PromoterFinance, row: { status: string; net_amount: number | string; created_at: string; network: string }) {
  const cents = Math.round(Number(row.net_amount) * 100);
  if (row.status === "PAID") finance.paidOutCents += cents;
  if (["PENDING", "APPROVED"].includes(row.status)) finance.pendingPayoutCents += cents;
  if (!finance.latestPayout || row.created_at > finance.latestPayout.date) {
    finance.latestPayout = { status: row.status, netCents: cents, date: row.created_at, network: row.network };
  }
}
