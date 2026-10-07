"use server";
import { headers } from "next/headers";
import { parseBusinessInterest, businessText } from "@/lib/business-interest";
import { consumeRate } from "@/lib/request-security";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { sendEmail, SUPPORT_EMAIL } from "@/lib/email";

export async function submitGuestBusinessEnquiry(form:FormData) {
  if(String(form.get("company_site")??"").trim()) return {success:"Thank you. Our team will contact you by email."};
  let email:string,details:Record<string,string>;
  try {
    details=parseBusinessInterest(form);
    email=businessText(form,"email","business email",254,3).toLowerCase();
    if(!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) return {error:"Enter a valid business email address."};
  } catch(error) { return {error:error instanceof Error?error.message:"Complete the enquiry form."}; }
  try {
    const ip=trustedClientIp(await headers());
    if(!ip) return {error:"Unable to verify this request. Please try again."};
    if(!(await consumeRate("business-enquiry-ip",ip,5,3600)) || !(await consumeRate("business-enquiry-email",email,2,3600)) || !(await consumeRate("business-enquiry-total","all",30,3600))) return {error:"Please wait before submitting another enquiry."};
    const text=["New B2B / API business enquiry",`Email supplied by visitor: ${email}`,`Contact: ${details.contact_name}`,`Business: ${details.legal_name}`,`Country: ${details.country}`,`Interest: ${details.interest}`,`Website: ${details.website || "Not provided"}`,`Phone: ${details.phone || "Not provided"}`,`Estimated monthly purchases: ${details.monthly_volume}`,"",details.activity,"","Email ownership and business details require manual verification. This enquiry does not create or approve an account."].join("\n");
    const delivery=await sendEmail({to:SUPPORT_EMAIL,replyTo:email,subject:"New InGamePin B2B / API business enquiry",text,html:`<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</pre>`});
    if(delivery.rejected?.length) throw Error("Delivery rejected");
    return {success:"Enquiry sent. Our team will contact you by email to complete business verification."};
  } catch { return {error:"Unable to send your enquiry right now. Please try again later."}; }
}
