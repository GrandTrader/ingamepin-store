import Link from "next/link";
import { notFound } from "next/navigation";
import AdminSidebar from "../../AdminSidebar";
import { requireBusinessAdmin, businessApplication } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDocumentLabels, businessDocumentGroups, businessDetailLabels, purchasingPurposes } from "@/lib/business-verification";
import BusinessActionForm from "@/components/BusinessActionForm";
import { reviewBusinessApplication, resendBusinessSetupEmail, approveBusinessApiIps } from "../actions";
export const dynamic="force-dynamic";
const input="mt-2 w-full rounded-xl border p-3";
export default async function BusinessAccountDetails({params}:{params:Promise<{id:string}>}) {
  await requireBusinessAdmin();
  const {id}=await params;
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) notFound();
  const r=await businessApplication(id);
  if(!r) notFound();
  const db=createAdminClient();
  const [customer,firstEvent]=await Promise.all([db.auth.admin.getUserById(id),db.from("business_kyb_events").select("created_at").eq("user_id",id).order("created_at",{ascending:true}).limit(1).maybeSingle()]);
  if(customer.error || firstEvent.error) throw Error("Unable to load customer contact details.");
  const ipApproval=await db.from("business_api_ip_approvals").select("ips,revision,updated_at").eq("user_id",id).maybeSingle();
  return <div className="mx-auto flex max-w-[1500px] flex-col bg-slate-50 text-slate-900 lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 space-y-5 p-4 sm:p-6">
    <Link href={`/admin/business-verification?status=${encodeURIComponent(r.status)}`} className="text-sm font-bold text-blue-700">← Back to B2B accounts</Link>
    <h1 className="text-2xl font-black">B2B account details</h1>
    <section className="space-y-5 rounded-2xl border bg-white p-5"><div><h2 className="text-xl font-black">{r.details.legal_name}</h2><p className="text-sm">{String(customer.data.user?.user_metadata?.full_name || r.details.contact_name || "")}</p><p className="break-all text-sm">{customer.data.user?.email ?? r.details.email}</p><p className="mt-1 text-xs text-slate-500">Created (IST): {new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(firstEvent.data?.created_at ?? r.submitted_at))}</p><Link href={`/admin/customers/${r.user_id}`} className="text-sm text-blue-700">Customer account</Link><p className="text-sm">{r.status} · Revision {r.revision}</p></div>
      <section className="space-y-3 rounded-xl border bg-slate-50 p-4">
        <h2 className="font-bold">API IP approval</h2>
        <p className="text-sm text-slate-600">Only these admin-approved static server IPs can use this customer&apos;s API keys. Customers cannot change this list.</p>
        {ipApproval.error ? <p role="alert" className="text-sm text-amber-700">IP approval controls require the latest database update.</p> : <BusinessActionForm key={ipApproval.data?.revision ?? 0} action={approveBusinessApiIps} button="Save approved IPs">
          <input type="hidden" name="user_id" value={id}/><input type="hidden" name="ip_revision" value={ipApproval.data?.revision ?? 0}/>
          <label className="block text-sm font-bold">Approved static server IP addresses<textarea name="ips" defaultValue={(ipApproval.data?.ips ?? []).join("\n")} rows={3} maxLength={1000} placeholder={"203.0.113.10\n2001:db8::10"} className={input}/></label>
          <p className="text-xs text-slate-600">One IPv4 or IPv6 address per line, up to 20. Leave empty to block all API access. The business account must be approved before adding IPs.</p>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="static_verified" value="yes"/>I verified these are fixed (static) outgoing server IP addresses. Required when approving IPs.</label>
          {ipApproval.data?.updated_at && <p className="text-xs text-slate-500">Last updated: {new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(ipApproval.data.updated_at))} IST</p>}
        </BusinessActionForm>}
      </section>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries(r.details).filter(([key])=>!["consent","verification_scope","phone_number","phone_country_code","address_line1","address_line2","city","state","postal_code","postal_code_not_applicable"].includes(key)).map(([key,value])=><div key={key}><dt className="font-bold capitalize">{businessDetailLabels[key]??key.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap break-words">{key==="buyer_type"?purchasingPurposes.find(([code])=>code===value)?.[1]??value:value}</dd></div>)}</dl>
      {Object.keys(r.documents).length > 0 && <details><summary className="cursor-pointer text-sm font-bold">Previously submitted documents</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{businessDocumentGroups.map(group=><div key={group.title} className="rounded-xl border bg-slate-50 p-4"><h3 className="mb-3 text-sm font-bold">{group.title}</h3><div className="grid gap-3">{group.keys.map(key=>r.documents[key]?<a className="text-sm font-bold text-blue-700 underline" key={key} href={`/api/business-documents?type=kyb&id=${r.user_id}&kind=${key}`}>{businessDocumentLabels[key]}</a>:<p key={key} className="text-sm text-amber-700">{businessDocumentLabels[key]} — Not provided</p>)}</div></div>)}</div></details>}
      {r.status === "APPROVED" && <BusinessActionForm action={resendBusinessSetupEmail} button="Resend setup email"><input type="hidden" name="user_id" value={r.user_id}/></BusinessActionForm>}
      {r.review_note&&<p className="whitespace-pre-wrap text-sm">Review note: {r.review_note}</p>}
      {<BusinessActionForm action={reviewBusinessApplication} button="Save account decision"><input type="hidden" name="user_id" value={r.user_id}/><input type="hidden" name="revision" value={r.revision}/><label className="block text-sm font-bold">Decision<select name="status" className={input} defaultValue="" required><option value="" disabled>Select decision</option>{r.status==="APPROVED"?<option value="REVOKED">Revoke access</option>:<><option value="APPROVED">Activate B2B account</option>{r.status==="PENDING"&&<option value="REJECTED">Decline request</option>}</>}</select></label><label className="block text-sm font-bold">Review note (visible to customer)<textarea name="note" required minLength={3} maxLength={1000} rows={2} className={input}/></label>{r.status!=="APPROVED"&&<label className="flex gap-2 text-sm"><input name="checked" type="checkbox" value="yes"/>I completed this customer&apos;s business verification by email. Required to activate access.</label>}</BusinessActionForm>}
    </section>
  </main></div>;
}
