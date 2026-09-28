import Link from "next/link";
import AdminSidebar from "../../AdminSidebar";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankFields } from "@/lib/business-verification";
import BusinessActionForm from "@/components/BusinessActionForm";
import { saveBusinessBankSettings } from "../actions";
export const dynamic="force-dynamic";
export default async function BankSettings() {
  await requireBusinessAdmin();const result=await createAdminClient().from("business_bank_settings").select("enabled,instructions").eq("id",true).single();
  if(result.error)throw Error("Unable to load bank settings.");
  const draft:Record<string,string>={beneficiary:"AMAN G",account_number:"00000043553167541",beneficiary_address:"SOUTH JOGENDRANAGAR, CHANDPUR LENINGARH, CHANDPUR CT, North Twenty, WEST BENGAL 700110, INDIA",bank:"State Bank of India",branch_address:"BOARDGHAR (SODEPUR ROAD) (A4047)",ifsc:"SBIN0014047",swift:"",routing_instructions:""};
  const saved=result.data.instructions as Record<string,string>;
  return <div className="mx-auto flex max-w-[1500px] flex-col bg-slate-50 text-slate-900 lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 space-y-5 p-5 sm:p-8"><Link href="/admin/business-verification" className="text-blue-700">← Business verification</Link><h1 className="text-3xl font-black">SBI USD bank transfers</h1><p>The statement details below are a draft. Verify the account number, full branch address, SWIFT and USD routing instructions with SBI before enabling. Customer wallets are in USD; deposits received in INR require a recorded conversion rate during review.</p>
    <section className="rounded-2xl border bg-white p-5"><BusinessActionForm action={saveBusinessBankSettings} button="Save bank instructions">{bankFields.map(([key,label])=><label className="block text-sm font-bold" key={key}>{label}<textarea name={key} rows={key==="routing_instructions"?4:2} maxLength={1500} defaultValue={saved[key]??draft[key]??""} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>)}<label className="flex gap-2 text-sm"><input name="bank_confirmed" type="checkbox" value="yes" defaultChecked={saved.bank_confirmed==="yes"}/>SBI has confirmed these instructions for receiving USD business payments.</label><label className="flex gap-2 font-bold"><input name="enabled" type="checkbox" value="yes" defaultChecked={result.data.enabled}/>Enable bank deposits for KYB-approved customers</label></BusinessActionForm></section>
  </main></div>;
}
