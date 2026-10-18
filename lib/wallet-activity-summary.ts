export type SummaryTransaction = {
  user_id: string; created_at: string; transaction_type: string; amount: number | string;
  balance_before: number | string | null; balance_after: number | string | null;
};
export type WalletPeriodSummary = { userId: string; opening: number | null; credit: number; debit: number; closing: number | null };

export function walletCents(value: number | string | null): number | null {
  if (value === null) return null;
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(Number(value)) || !Number.isSafeInteger(cents)) throw new Error("Invalid wallet amount.");
  return cents;
}
export function addWalletCents(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("Wallet total is too large to calculate accurately.");
  return result;
}
export function summaryMoney(cents: number | null) { return cents === null ? "Not recorded" : (cents / 100).toFixed(2); }

type Group = { time: string; net: number; complete: boolean; edges: Map<number, number>; balances: Set<number> };
type State = { credit: number; debit: number; closing: number | null; newerNet: number; group: Group | null };

// Input is newest first, including earlier history for unchanged balances in an empty period.
export class WalletSummaryAccumulator {
  private states = new Map<string, State>();
  constructor(private start: string | null) {}

  private finishGroup(state: State) {
    const group = state.group;
    if (!group) return;
    if (state.closing === null && group.complete) {
      const edges = [...group.edges].filter(([, count]) => count !== 0);
      const opening = edges.filter(([, count]) => count === 1), closing = edges.filter(([, count]) => count === -1);
      // UUID ordering is not transaction ordering when several entries share a timestamp.
      // The unmatched endpoints identify the real before/after balance of the whole group.
      const balance = edges.length === 2 && opening.length === 1 && closing.length === 1
        ? closing[0][0]
        : edges.length === 0 && group.balances.size === 1 ? [...group.balances][0] : null;
      if (balance !== null) state.closing = addWalletCents(balance, state.newerNet);
    }
    state.newerNet = addWalletCents(state.newerNet, group.net);
    state.group = null;
  }

  add(item: SummaryTransaction) {
    const state = this.states.get(item.user_id) ?? { credit: 0, debit: 0, closing: null, newerNet: 0, group: null };
    this.states.set(item.user_id, state);
    if (state.group?.time !== item.created_at) {
      this.finishGroup(state);
      state.group = { time: item.created_at, net: 0, complete: true, edges: new Map(), balances: new Set() };
    }
    const group = state.group!;
    const before = walletCents(item.balance_before), after = walletCents(item.balance_after), amount = walletCents(item.amount)!;
    let delta: number;
    if (before !== null && after !== null) delta = addWalletCents(after, -before);
    else if (item.transaction_type === "DEBIT") delta = -amount;
    else if (["CREDIT", "REFUND"].includes(item.transaction_type)) delta = amount;
    else throw new Error("Wallet activity direction is not recorded.");
    if (Math.abs(delta) !== amount) throw new Error("Wallet amounts do not match recorded balance changes.");
    group.net = addWalletCents(group.net, delta);
    if (before === null || after === null) group.complete = false;
    else {
      group.edges.set(before, (group.edges.get(before) ?? 0) + 1);
      group.edges.set(after, (group.edges.get(after) ?? 0) - 1);
      group.balances.add(before); group.balances.add(after);
    }
    if (!this.start || Date.parse(item.created_at) >= Date.parse(this.start)) {
      if (delta > 0) state.credit = addWalletCents(state.credit, delta);
      else state.debit = addWalletCents(state.debit, -delta);
    }
  }

  summaries(): WalletPeriodSummary[] {
    return [...this.states].map(([userId, state]) => {
      this.finishGroup(state);
      return { userId, opening: state.closing === null ? null : addWalletCents(addWalletCents(state.closing, -state.credit), state.debit), credit: state.credit, debit: state.debit, closing: state.closing };
    });
  }
}
