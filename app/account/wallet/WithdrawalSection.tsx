import { createClient } from "@/lib/supabase/server";
import { WITHDRAWAL_SELECT, type Withdrawal } from "@/lib/wallet-withdrawals";
import AccountReturnField from "@/components/AccountReturnField";
import WithdrawalHistory from "@/components/WithdrawalHistory";
import WithdrawalForm from "./WithdrawalForm";
import { cancelWithdrawal } from "./withdrawal-actions";

export default async function WithdrawalSection({ userId, walletEnabled, balance }: { userId: string; walletEnabled: boolean; balance: number }) {
  const client = await createClient();
  const [access, active, history] = await Promise.all([
    client.from("wallet_withdrawal_access").select("enabled").eq("user_id", userId).maybeSingle(),
    client.from("wallet_withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId).in("status", ["REQUESTED", "APPROVED"]),
    client.from("wallet_withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId).not("status", "in", "(REQUESTED,APPROVED)").order("created_at", { ascending: false }).limit(20),
  ]);
  if (access.error || active.error || history.error) return <p id="withdrawals" className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">Withdrawal information is temporarily unavailable. Please try again later.</p>;
  const enabled = access.data?.enabled === true && walletEnabled;
  const pending = (active.data ?? []) as Withdrawal[];
  const rows = [...pending, ...(history.data ?? [])] as Withdrawal[];
  if (!enabled && !rows.length) return null;
  return <section id="withdrawals" className="mt-3 scroll-mt-32 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-lg font-bold">Crypto withdrawals</h2>
    {pending.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Reserved: {"$"}{pending.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)}. This is already excluded from your available wallet balance.</p>}
    {enabled && !pending.length && <details className="mt-3"><summary className="cursor-pointer rounded-lg bg-cyan-700 px-4 py-3 text-center font-bold text-white">Request withdrawal</summary><WithdrawalForm balance={balance} requestKey={crypto.randomUUID()} /></details>}
    {!enabled && rows.length > 0 && <p className="mt-2 text-sm text-slate-600">New withdrawal requests are disabled. Your existing requests remain visible below.</p>}
    {!!rows.length && <details className="mt-4" open={pending.length > 0}><summary className="cursor-pointer text-sm font-bold">Withdrawal history · active and latest 20 finished requests</summary><div className="mt-3 space-y-3">{rows.map(row => <article key={row.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
      <WithdrawalHistory row={row} />
      {row.status === "REQUESTED" && walletEnabled && <form action={cancelWithdrawal} className="mt-3"><AccountReturnField area="wallet" /><input type="hidden" name="request_id" value={row.id} /><button className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Cancel request & release funds</button></form>}
    </article>)}</div></details>}
  </section>;
}
