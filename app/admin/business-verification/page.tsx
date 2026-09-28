import Link from "next/link";
import AdminSidebar from "../AdminSidebar";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDocumentLabels, businessDocumentGroups, businessDetailLabels, purchasingPurposes, type BusinessApplication } from "@/lib/business-verification";
import BusinessActionForm from "@/components/BusinessActionForm";
import { reviewBusinessApplication } from "./actions";
export const dynamic="force-dynamic";
const input="mt-2 w-full rounded-xl border p-3";
export default async function BusinessReviews({searchParams}:{searchParams:Promise<{status?:string;page?:string}>}) {
  await requireBusinessAdmin();const params=await searchParams;
  const status=["PENDING","APPROVED","REJECTED","REVOKED"].includes(params.status??"")?params.status!:"PENDING";
  const page=Math.max(1,Math.min(10000,Number.parseInt(params.page??"1")||1));
  const db=createAdminClient();const result=await db.from("business_kyb").select("*",{count:"exact"}).eq("status",status).order("submitted_at",{ascending:true}).range((page-1)*10,page*10-1);
  if(result.error)throw Error("Unable to load business applications. Check that the business verification database update is installed.");
  const rows=(result.data??[]) as BusinessApplication[];
  return <div className="mx-auto flex max-w-[1500px] flex-col bg-slate-50 text-slate-900 lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 space-y-6 p-5 sm:p-8">
    <h1 className="text-3xl font-black">Business verification · KYC & KYB</h1><div className="flex flex-wrap gap-5 font-bold text-blue-700"><Link href="/admin/business-verification/deposits">Bank deposit reviews</Link><Link href="/admin/business-verification/bank-settings">SBI bank settings</Link></div>
    <nav className="flex flex-wrap gap-4">{["PENDING","APPROVED","REJECTED","REVOKED"].map(s=><Link className={s===status?"font-bold text-blue-700":""} key={s} href={`?status=${s}`}>{s}</Link>)}</nav>
    {!rows.length&&<p>No applications in this view.</p>}
    {rows.map(r=><section key={r.user_id+":"+r.revision} className="space-y-5 rounded-2xl border bg-white p-5"><div><h2 className="text-xl font-black">{r.details.legal_name}</h2><Link href={`/admin/customers/${r.user_id}`} className="text-sm text-blue-700">Customer account</Link><p className="text-sm">{r.status} · Revision {r.revision}</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries(r.details).filter(([key])=>!["consent","verification_scope","phone_number","phone_country_code","address_line1","address_line2","city","state","postal_code","postal_code_not_applicable"].includes(key)).map(([key,value])=><div key={key}><dt className="font-bold capitalize">{businessDetailLabels[key]??key.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap break-words">{key==="buyer_type"?purchasingPurposes.find(([code])=>code===value)?.[1]??value:value}</dd></div>)}</dl>
      <div className="grid gap-4 sm:grid-cols-2">{businessDocumentGroups.map(group=><div key={group.title} className="rounded-xl border bg-slate-50 p-4"><h3 className="mb-3 text-sm font-bold">{group.title}</h3><div className="grid gap-3">{group.keys.map(key=>r.documents[key]?<a className="text-sm font-bold text-blue-700 underline" key={key} href={`/api/business-documents?type=kyb&id=${r.user_id}&kind=${key}`}>{businessDocumentLabels[key]}</a>:<p key={key} className="text-sm text-amber-700">{businessDocumentLabels[key]} — Not provided</p>)}</div></div>)}</div>
      {r.review_note&&<p className="whitespace-pre-wrap text-sm">Review note: {r.review_note}</p>}
      {["PENDING","APPROVED"].includes(r.status)&&<BusinessActionForm action={reviewBusinessApplication} button="Save verification decision"><input type="hidden" name="user_id" value={r.user_id}/><input type="hidden" name="revision" value={r.revision}/><label className="block text-sm font-bold">Decision<select name="status" className={input} defaultValue={r.status==="APPROVED"?"REVOKED":""} required><option value="" disabled>Select decision</option>{r.status==="PENDING"?<><option value="APPROVED">Approve</option><option value="REJECTED">Reject / request corrections</option></>:<option value="REVOKED">Revoke approval</option>}</select></label><label className="block text-sm font-bold">Review note (visible to customer)<textarea name="note" required minLength={3} maxLength={1000} rows={2} className={input}/></label>{r.status==="PENDING"&&<label className="flex gap-2 text-sm"><input name="checked" type="checkbox" value="yes"/>I reviewed the representative’s identity and personal address (KYC), and the business registration, address and ownership (KYB). Required for approval.</label>}</BusinessActionForm>}
    </section>)}
    <div className="flex justify-between">{page>1?<Link href={`?status=${status}&page=${page-1}`}>Previous</Link>:<span/>}<span>Page {page}</span>{page*10<(result.count??0)&&<Link href={`?status=${status}&page=${page+1}`}>Next</Link>}</div>
  </main></div>;
}
