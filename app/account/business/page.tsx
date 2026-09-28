import Link from "@/components/ScopedAccountLink";
import CustomerAccountShell from "../CustomerAccountShell";
import { requireCustomer, formatCustomerDate } from "@/lib/customer-account-data";
import { businessApplication } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankFields, type BusinessDeposit } from "@/lib/business-verification";
import BusinessActionForm from "@/components/BusinessActionForm";
import { submitBusinessDeposit } from "./actions";
import BusinessVerificationForm from "./BusinessVerificationForm";
export const dynamic="force-dynamic";
const input="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal";
export default async function BusinessPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const {user,displayName}=await requireCustomer();const app=await businessApplication(user.id);
  const params=await searchParams;const page=Math.max(1,Math.min(10000,Number.parseInt(params.page??"1")||1));
  const db=createAdminClient();
  const [settings,deposits]=await Promise.all([
    app?.status==="APPROVED"?db.from("business_bank_settings").select("enabled,instructions").eq("id",true).maybeSingle():Promise.resolve({data:null,error:null}),
    db.from("business_bank_deposits").select("id,user_id,amount_usd,sender_name,customer_reference,status,credited_usd,note,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).range((page-1)*10,page*10),
  ]);
  if(settings.error||deposits.error)throw Error("Unable to load business banking. Please try again.");
  const rows=(deposits.data??[]) as BusinessDeposit[];
  return <CustomerAccountShell displayName={displayName}><div className="space-y-6">
    <div><h1 className="text-3xl font-black">Business verification · KYC & KYB</h1><p className="mt-2 text-slate-600">For resellers and bulk buyers. Admin approval is required before business purchases and USD bank deposits.</p><p className="mt-2 text-sm text-slate-500">Verified businesses use the business portal. Monthly net paid purchases of USD 5,000 or more qualify as Reseller; below this amount the tier is Retailer.</p></div>
    {app&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">{app.details.legal_name} — {app.status.replaceAll("_"," ")}</h2><p className="mt-2 text-sm">Submitted {formatCustomerDate(app.submitted_at)}</p>{app.review_note&&<p className="mt-3 whitespace-pre-wrap">Review note: {app.review_note}</p>}<p className="mt-3 text-sm">Contact support if your approved business details change.</p></section>}
    {(!app||["REJECTED","REVOKED"].includes(app.status))&&<BusinessVerificationForm details={app?.details}/>}
    {app?.status==="APPROVED"&&<Link href="/account/portal" className="inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Open business portal →</Link>}
    {app?.status==="APPROVED"&&<section className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6"><h2 className="text-xl font-black">USD bank transfer to wallet</h2>
      {!settings.data?.enabled?<p>USD bank transfers are not available yet. You can use the existing <Link href="/account/wallet" className="text-blue-700 underline">wallet payment methods</Link>.</p>:<>
        <p className="text-sm">Send the payment using these instructions. Your wallet is credited after admin confirms the bank receipt. Bank deductions and currency conversion may reduce the USD amount credited.</p>
        <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm">{bankFields.map(([key,label])=><div key={key}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap break-words">{String(settings.data?.instructions?.[key]??"")}</dd></div>)}</dl>
        <p className="text-sm">Use your registered business name as the sender and your InGamePIN account email as the payment reference. For a bank-requested invoice or purpose details, contact support before sending.</p>
        <BusinessActionForm action={submitBusinessDeposit} button="Submit bank transfer for review"><label className="block text-sm font-bold">Amount sent in USD<input name="amount" type="number" min="10" max="50000" step="0.01" required className={input}/></label><label className="block text-sm font-bold">Sender / business name<input name="sender" required minLength={2} maxLength={160} defaultValue={app.details.legal_name} className={input}/></label><label className="block text-sm font-bold">Transfer reference<input name="reference" required minLength={3} maxLength={160} className={input}/></label><label className="block text-sm font-bold">Bank transfer receipt (PDF / JPG / PNG, up to 1 MB)<input type="file" name="receipt" required accept="application/pdf,image/jpeg,image/png" className={input}/></label></BusinessActionForm>
      </>}
    </section>}
    {!!rows.length&&<section className="space-y-3"><h2 className="text-xl font-black">Bank deposit history</h2>{rows.slice(0,10).map(r=><article key={r.id} className="rounded-xl border bg-white p-4 text-sm"><p className="font-bold">USD {Number(r.amount_usd).toFixed(2)} — {r.status}</p><p>{formatCustomerDate(r.created_at)} · {r.customer_reference}</p>{r.credited_usd!=null&&<p>Wallet credited: USD {Number(r.credited_usd).toFixed(2)}</p>}{r.note&&<p className="mt-2 whitespace-pre-wrap">{r.note}</p>}</article>)}<div className="flex gap-5">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}{rows.length>10&&<Link href={`?page=${page+1}`}>Next</Link>}</div></section>}
  </div></CustomerAccountShell>;
}
