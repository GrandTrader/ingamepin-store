import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { businessApplication } from "@/lib/business-verification-data";
import BusinessInterestForm from "@/app/account/business/BusinessInterestForm";
import { submitGuestBusinessEnquiry } from "./actions";
export const dynamic="force-dynamic";
export const metadata={title:"B2B & API enquiry | InGamePin"};
export default async function BusinessEnquiryPage() {
  const {data:{user}}=await (await createClient()).auth.getUser();
  if(user?.email_confirmed_at) {
    const application=await businessApplication(user.id);
    if(application?.status==="APPROVED") redirect("/account/portal");
    redirect("/account/business");
  }
  return <main className="bg-slate-50 px-4 py-7 text-slate-900"><div className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-black">B2B & API business enquiry</h1>
    <p className="text-sm text-slate-600">Tell us about your business. Our team will contact you by email.</p>
    <BusinessInterestForm email="" name="" guest action={submitGuestBusinessEnquiry}/>
    <p className="text-sm">Already have an account? <Link className="font-bold text-blue-700" href="/account">Sign in</Link></p>
  </div></main>;
}
