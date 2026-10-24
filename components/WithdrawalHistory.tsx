import { receiptExplorerUrl } from "@/lib/wallet-receipt";
import { WITHDRAWAL_STATUS, withdrawalDate, type Withdrawal } from "@/lib/wallet-withdrawals";

export default function WithdrawalHistory({ row }: { row: Withdrawal }) {
  const explorer = receiptExplorerUrl(row.network, row.transaction_id);
  return <>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="font-bold">{"$"}{Number(row.amount).toFixed(2)} from wallet</p><p className="mt-1 text-sm">{Number(row.net_usdt).toFixed(2)} USDT payout · {row.network}</p></div>
      <span className={"rounded-full px-3 py-1 text-xs font-bold " + (row.status === "PAID" ? "bg-emerald-100 text-emerald-800" : row.status === "REQUESTED" || row.status === "APPROVED" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700")}>{WITHDRAWAL_STATUS[row.status] ?? row.status}</span>
    </div>
    <p className="mt-2 text-xs text-slate-500">Fixed fee: {"$"}{Number(row.network_fee).toFixed(2)} · {withdrawalDate(row.created_at)} IST</p>
    <p className="mt-2 break-all font-mono text-xs">{row.wallet_address}</p>
    <p className="mt-1 break-all text-xs text-slate-500">Request: {row.id}</p>
    {row.reason && <p className="mt-2 text-sm text-red-700">{row.reason}</p>}
    {row.transaction_id && <p className="mt-2 break-all text-xs">Transaction: {explorer ? <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{row.transaction_id}</a> : row.transaction_id}</p>}
    {row.completed_at && <p className="mt-2 text-xs text-slate-500">Updated: {withdrawalDate(row.completed_at)} IST</p>}
  </>;
}
