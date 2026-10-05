import Link from "next/link";
import AdminSidebar from "../AdminSidebar";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDocumentLabels, businessDocumentGroups, businessDetailLabels, purchasingPurposes, type BusinessApplication } from "@/lib/business-verification";
import BusinessActionForm from "@/components/BusinessActionForm";
import { countryCallingCodes } from "@/lib/countryCallingCodes";
import { reviewBusinessApplication, createBusinessAccount, resendBusinessSetupEmail } from "./actions";
export const dynamic="force-dynamic";
const input="mt-2 w-full rounded-xl border p-3";
export default async function BusinessReviews({searchParams}:{searchParams:Promise<{status?:string;page?:string}>}) {
  await requireBusinessAdmin();const params=await searchParams;
  const status=["PENDING","APPROVED","REJECTED","REVOKED"].includes(params.status??"")?params.status!:"PENDING";
  const page=Math.max(1,Math.min(10000,Number.parseInt(params.page??"1")||1));
  const db=createAdminClient();const result=await db.from("business_kyb").select("*",{count:"exact"}).eq("status",status).order("submitted_at",{ascending:true}).range((page-1)*10,page*10-1);
  if(result.error)throw Error("Unable to load business applications. Check that the business verification database update is installed.");
  const rows=(result.data??[]) as BusinessApplication[];
  const emails = new Map(await Promise.all(rows.map(async row => {
    const customer = await db.auth.admin.getUserById(row.user_id);
    if (customer.error) throw Error("Unable to load customer contact details.");
    return [row.user_id, customer.data.user?.email ?? row.details.email ?? ""] as const;
  })));
  return <div className="mx-auto flex max-w-[1500px] flex-col bg-slate-50 text-slate-900 lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 space-y-6 p-5 sm:p-8">
    <h1 className="text-3xl font-black">B2B accounts & API requests</h1><div className="flex flex-wrap gap-5 font-bold text-blue-700"><Link href="/admin/business-verification/deposits">Bank deposit reviews</Link><Link href="/admin/business-verification/bank-settings">SBI bank settings</Link></div>
    <p className="text-sm text-slate-600">Review customer interest and activate B2B access after business verification by email.</p>
    <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-bold text-blue-700">Create B2B account for a customer</summary><div className="mt-4">
      <p className="mb-4 text-sm text-slate-600">Use the customer&apos;s existing, verified account email. We will send a password setup email automatically. Google Authenticator is required before B2B access. If they already submitted a request, approve it below.</p>
      <BusinessActionForm action={createBusinessAccount} button="Create B2B account">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">Customer email *<input className={input} name="email" type="email" required maxLength={254}/></label>
          <label className="text-sm font-bold">Business name *<input className={input} name="legal_name" required minLength={2} maxLength={160}/></label>
          <label className="text-sm font-bold">Country *<select className={input} name="country" defaultValue="" required><option value="" disabled>Select country</option>{countryCallingCodes.map(([name])=><option key={name}>{name}</option>)}</select></label>
          <label className="text-sm font-bold">Registration / tax number (optional)<input className={input} name="registration_number" maxLength={100}/></label>
          <label className="text-sm font-bold sm:col-span-2">Billing address (optional)<textarea className={input} name="address" maxLength={600} rows={2}/></label>
        </div>
        <label className="block text-sm font-bold">Review note (visible to customer) *<textarea className={input} name="note" required minLength={3} maxLength={1000} rows={2}/></label>
        <label className="flex gap-2 text-sm"><input name="checked" type="checkbox" value="yes" required/>I completed this customer&apos;s business verification by email.</label>
      </BusinessActionForm>
    </div></details>
    <nav className="flex flex-wrap gap-4">{["PENDING","APPROVED","REJECTED","REVOKED"].map(s=><Link className={s===status?"font-bold text-blue-700":""} key={s} href={`?status=${s}`}>{s}</Link>)}</nav>
    {!rows.length&&<p>No business accounts or requests in this view.</p>}
    {rows.map(r=><section key={r.user_id+":"+r.revision} className="space-y-5 rounded-2xl border bg-white p-5"><div><h2 className="text-xl font-black">{r.details.legal_name}</h2><p className="break-all text-sm">{emails.get(r.user_id)}</p><Link href={`/admin/customers/${r.user_id}`} className="text-sm text-blue-700">Customer account</Link><p className="text-sm">{r.status} · Revision {r.revision}</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries(r.details).filter(([key])=>!["consent","verification_scope","phone_number","phone_country_code","address_line1","address_line2","city","state","postal_code","postal_code_not_applicable"].includes(key)).map(([key,value])=><div key={key}><dt className="font-bold capitalize">{businessDetailLabels[key]??key.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap break-words">{key==="buyer_type"?purchasingPurposes.find(([code])=>code===value)?.[1]??value:value}</dd></div>)}</dl>
      {Object.keys(r.documents).length > 0 && <details><summary className="cursor-pointer text-sm font-bold">Previously submitted documents</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{businessDocumentGroups.map(group=><div key={group.title} className="rounded-xl border bg-slate-50 p-4"><h3 className="mb-3 text-sm font-bold">{group.title}</h3><div className="grid gap-3">{group.keys.map(key=>r.documents[key]?<a className="text-sm font-bold text-blue-700 underline" key={key} href={`/api/business-documents?type=kyb&id=${r.user_id}&kind=${key}`}>{businessDocumentLabels[key]}</a>:<p key={key} className="text-sm text-amber-700">{businessDocumentLabels[key]} — Not provided</p>)}</div></div>)}</div></details>}
      {r.status === "APPROVED" && <BusinessActionForm action={resendBusinessSetupEmail} button="Resend setup email"><input type="hidden" name="user_id" value={r.user_id}/></BusinessActionForm>}
      {r.review_note&&<p className="whitespace-pre-wrap text-sm">Review note: {r.review_note}</p>}
      {<BusinessActionForm action={reviewBusinessApplication} button="Save account decision"><input type="hidden" name="user_id" value={r.user_id}/><input type="hidden" name="revision" value={r.revision}/><label className="block text-sm font-bold">Decision<select name="status" className={input} defaultValue="" required><option value="" disabled>Select decision</option>{r.status==="APPROVED"?<option value="REVOKED">Revoke access</option>:<><option value="APPROVED">Activate B2B account</option>{r.status==="PENDING"&&<option value="REJECTED">Decline request</option>}</>}</select></label><label className="block text-sm font-bold">Review note (visible to customer)<textarea name="note" required minLength={3} maxLength={1000} rows={2} className={input}/></label>{r.status!=="APPROVED"&&<label className="flex gap-2 text-sm"><input name="checked" type="checkbox" value="yes"/>I completed this customer&apos;s business verification by email. Required to activate access.</label>}</BusinessActionForm>}
    </section>)}
    <div className="flex justify-between">{page>1?<Link href={`?status=${status}&page=${page-1}`}>Previous</Link>:<span/>}<span>Page {page}</span>{page*10<(result.count??0)&&<Link href={`?status=${status}&page=${page+1}`}>Next</Link>}</div>
  </main></div>;
}
