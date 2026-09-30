import Link from "next/link";
import AdminSidebar from "../../AdminSidebar";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessDeposit } from "@/lib/business-verification";
import DepositReview from "./DepositReview";
export const dynamic="force-dynamic";
export default async function Deposits({searchParams}:{searchParams:Promise<{history?:string;page?:string}>}) {
  await requireBusinessAdmin();const params=await searchParams;const history=params.history==="1";
  const page=Math.max(1,Math.min(10000,Number.parseInt(params.page??"1")||1));
  const db=createAdminClient();const r=await db.from("business_bank_deposits").select("*",{count:"exact"}).in("status",history?["CREDITED","REJECTED"]:["PENDING"]).order("created_at",{ascending:!history}).range((page-1)*15,page*15-1);
  if(r.error)throw Error("Unable to load bank deposits.");const rows=(r.data??[]) as BusinessDeposit[];
  return <div className="mx-auto flex max-w-[1500px] flex-col bg-slate-50 text-slate-900 lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 space-y-5 p-5 sm:p-8"><Link href="/admin/business-verification" className="text-blue-700">← Business verification</Link><h1 className="text-3xl font-black">SBI wallet deposits</h1><nav className="flex gap-4"><Link href="?history=0">Pending review</Link><Link href="?history=1">History</Link></nav>{!rows.length&&<p>No deposits in this view.</p>}{rows.map(d=><section key={d.id} className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">USD {Number(d.amount_usd).toFixed(2)} — {d.status}</h2><p className="text-sm">Sender: {d.sender_name}<br/>Customer reference: {d.customer_reference}<br/>Submitted: {new Date(d.created_at).toLocaleString("en-IN")}</p><div className="flex gap-4 text-sm text-blue-700"><Link href={`/admin/customers/${d.user_id}`}>Customer</Link><a href={`/api/business-documents?type=deposit&id=${d.id}`}>Download transfer receipt</a>{d.invoice_id&&<Link href={`/admin/business-verification/invoices/${d.invoice_id}`}>View bank invoice</Link>}</div>{d.status==="PENDING"?<DepositReview id={d.id} amount={Number(d.amount_usd)}/>:<p className="whitespace-pre-wrap">{d.credited_usd!=null?`Credited USD ${Number(d.credited_usd).toFixed(2)}. `:""}{d.note}</p>}</section>)}<div className="flex justify-between">{page>1?<Link href={`?history=${history?1:0}&page=${page-1}`}>Previous</Link>:<span/>}<span>Page {page}</span>{page*15<(r.count??0)&&<Link href={`?history=${history?1:0}&page=${page+1}`}>Next</Link>}</div></main></div>;
}
