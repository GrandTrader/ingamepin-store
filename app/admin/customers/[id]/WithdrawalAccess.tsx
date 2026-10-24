import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { setWithdrawalAccess } from "../../wallet/withdrawals/actions";

export default async function WithdrawalAccess({ customerId }: { customerId: string }) {
  const result = await createAdminClient().from("wallet_withdrawal_access").select("enabled").eq("user_id", customerId).maybeSingle();
  const enabled = result.data?.enabled === true;
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-black">Crypto withdrawal access</h2><p className="mt-1 text-sm text-slate-600">{result.error ? "Withdrawal setup is unavailable. Check the database update." : enabled ? "Enabled: this customer can request a USDT withdrawal for admin approval." : "Disabled: this customer cannot create withdrawal requests."}</p><p className="mt-1 text-xs text-slate-500">Fixed fees: TRC20 $4.50 · BEP20 $0.50 · Solana $2.50. Manual payout after approval.</p></div>
      <form action={setWithdrawalAccess}><input type="hidden" name="customer_id" value={customerId} /><input type="hidden" name="enabled" value={enabled ? "false" : "true"} /><button disabled={!!result.error} className={"min-h-11 rounded-xl px-5 py-3 font-bold text-white disabled:opacity-50 " + (enabled ? "bg-red-600" : "bg-blue-600")}>{enabled ? "Disable withdrawals" : "Enable withdrawals"}</button></form>
    </div><Link href={"/admin/wallet/withdrawals?customer=" + customerId} prefetch={false} className="mt-3 inline-block text-sm font-bold text-blue-700 underline">View customer withdrawals →</Link>
  </section>;
}
