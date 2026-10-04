import Link from "next/link";
import type { PromoterFinance } from "@/lib/affiliate-directory-finance";

const amount=(cents:number)=>(cents/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function PromoterEarnings({id,finance}:{id:string;finance:PromoterFinance}) {
  const latest=finance.latestPayout;
  return <section aria-label="Earnings and payouts" className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 pb-2">
    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
      <span className="font-bold">USDT · All time</span>
      <Link href={`/admin/affiliates/promoters/${id}?tab=payouts`} className="inline-flex min-h-[44px]! shrink-0 items-center text-xs font-bold text-blue-700 hover:underline">Payout details →</Link>
    </div>
    <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5">
      {[["Total earned",finance.earnedCents],["Available",finance.availableCents],["Pending",finance.pendingCents],["Payout pending",finance.pendingPayoutCents],["Paid out",finance.paidOutCents],["Held",finance.heldCents]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-[11px] leading-4 text-slate-500">{label}</dt><dd className={`break-all text-sm font-bold leading-5 ${label==="Available"?"text-emerald-700":"text-slate-900"}`}>{amount(Number(value))}</dd></div>)}
    </dl>
    <div className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] leading-4 text-slate-500">
      {latest ? <p className="break-words">Latest: <strong>{amount(latest.netCents)} USDT</strong> · {latest.status.charAt(0)+latest.status.slice(1).toLowerCase()}</p> : <p>No payouts yet.</p>}
      <p>Payout amounts are after fees.</p>
    </div>
  </section>;
}
