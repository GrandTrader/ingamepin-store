import Link from "next/link";
import BusinessAccountRows from "./BusinessAccountRows";
import AdminSidebar from "../AdminSidebar";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { type BusinessApplication } from "@/lib/business-verification";
import BusinessActionForm from "@/components/BusinessActionForm";
import { countryCallingCodes } from "@/lib/countryCallingCodes";
import { createBusinessAccount } from "./actions";
export const dynamic="force-dynamic";
const input="mt-2 w-full rounded-xl border p-3";
export default async function BusinessReviews({searchParams}:{searchParams:Promise<{status?:string;page?:string}>}) {
  await requireBusinessAdmin();const params=await searchParams;
  const status=["PENDING","APPROVED","REJECTED","REVOKED"].includes(params.status??"")?params.status!:"PENDING";
  const page=Math.max(1,Math.min(10000,Number.parseInt(params.page??"1")||1));
  const db=createAdminClient();const result=await db.from("business_kyb").select("*",{count:"exact"}).eq("status",status).order("submitted_at",{ascending:true}).range((page-1)*10,page*10-1);
  if(result.error)throw Error("Unable to load business applications. Check that the business verification database update is installed.");
  const rows=(result.data??[]) as BusinessApplication[];
  const contacts = new Map(await Promise.all(rows.map(async row => {
    const [customer, firstEvent] = await Promise.all([
      db.auth.admin.getUserById(row.user_id),
      db.from("business_kyb_events").select("created_at").eq("user_id",row.user_id).order("created_at",{ascending:true}).limit(1).maybeSingle(),
    ]);
    if (customer.error || firstEvent.error) throw Error("Unable to load customer account details.");
    return [row.user_id, {email:customer.data.user?.email ?? row.details.email ?? "",name:String(customer.data.user?.user_metadata?.full_name || row.details.contact_name || row.details.legal_name || ""),createdAt:firstEvent.data?.created_at ?? row.submitted_at}] as const;
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
    <BusinessAccountRows rows={rows.map(r=>({id:r.user_id,businessName:r.details.legal_name || "Business account",name:contacts.get(r.user_id)?.name || "—",email:contacts.get(r.user_id)?.email || "—",createdAt:contacts.get(r.user_id)?.createdAt || r.submitted_at,status:r.status}))}/>
    <div className="flex justify-between">{page>1?<Link href={`?status=${status}&page=${page-1}`}>Previous</Link>:<span/>}<span>Page {page}</span>{page*10<(result.count??0)&&<Link href={`?status=${status}&page=${page+1}`}>Next</Link>}</div>
  </main></div>;
}
