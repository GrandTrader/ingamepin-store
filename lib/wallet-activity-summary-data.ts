import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { WalletSummaryAccumulator, type SummaryTransaction } from "./wallet-activity-summary";

type Options = { customer: string; start: string | null; end: string | null; cutoff: string; signal?: AbortSignal; cancelled?: () => boolean };

// Call only after verifying administrator access. Read all pages, not just the visible transactions.
export async function loadWalletPeriodSummaries(admin: ReturnType<typeof createAdminClient>, options: Options) {
  const { customer, start, end, cutoff, signal } = options;
  const accumulator = new WalletSummaryAccumulator(start);
  let cursorId = "", cursorDate = "";
  while (!signal?.aborted && !options.cancelled?.()) {
    let query = admin.from("wallet_transactions")
      .select("id,user_id,transaction_type,amount,balance_before,balance_after,created_at")
      .lte("created_at", cutoff);
    if (customer) query = query.eq("user_id", customer);
    if (end) query = query.lt("created_at", end);
    if (cursorId) query = query.or("created_at.lt." + cursorDate + ",and(created_at.eq." + cursorDate + ",id.lt." + cursorId + ")");
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw new Error("Unable to calculate wallet summary.");
    const transactions = (result.data ?? []) as (SummaryTransaction & { id: string })[];
    if (!transactions.length) break;
    for (const item of transactions) accumulator.add(item);
    const last = transactions[transactions.length - 1];
    if (cursorId === last.id) throw new Error("Unable to finish wallet summary.");
    cursorId = last.id; cursorDate = last.created_at;
  }
  if (signal?.aborted || options.cancelled?.()) throw new Error("Wallet summary cancelled.");
  return accumulator.summaries();
}
