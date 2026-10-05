"use server";
import { parseBusinessInterest } from "@/lib/business-interest";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/customer-account-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_BUCKET, readBusinessFile } from "@/lib/business-verification";

export async function submitBusinessApplication(form: FormData) {
  const { user } = await requireCustomer();
  if (!user.email_confirmed_at || !user.email) return { error: "Verify your account email before applying." };
  try {
    const details = { ...parseBusinessInterest(form), email: user.email.toLowerCase() };
    const r = await createAdminClient().rpc("submit_business_interest", { p_user: user.id, p_details: details });
    if (r.error) return { error: r.error.code === "P0001" ? r.error.message : "Unable to submit your interest. Please contact support." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to submit your interest." }; }
  revalidatePath("/account/business");
  revalidatePath("/admin/business-verification");
  return { success: "Interest submitted. Our team will contact you by email to complete verification." };
}

export async function submitBusinessDeposit(form:FormData) {
  const {user}=await requireCustomer();const db=createAdminClient();let path:string|null=null;let saveAttempted=false;
  try {
    const raw=String(form.get("amount")??"");if(!/^\d+(\.\d{1,2})?$/.test(raw)||Number(raw)<10||Number(raw)>50000) return {error:"Enter USD 10–50,000 with at most two decimal places."};
    const file=await readBusinessFile(form.get("receipt"));
    const kyb=await db.from("business_kyb").select("status").eq("user_id",user.id).maybeSingle();
    if(kyb.error||kyb.data?.status!=="APPROVED")return {error:"Approved business verification is required."};
    path=`${user.id}/${randomUUID()}.${file.ext}`;
    const upload=await db.storage.from(BUSINESS_BUCKET).upload(path,file.bytes,{contentType:file.mime,upsert:false});
    if(upload.error)throw Error("Unable to upload the receipt.");
    saveAttempted=true;
    const r=await db.rpc("request_business_bank_deposit",{p_id:randomUUID(),p_user:user.id,p_amount:Number(raw),p_sender:String(form.get("sender")??"").trim(),p_reference:String(form.get("reference")??"").trim(),p_receipt:path});
    if(r.error?.code==="P0001"||r.error?.code==="23505")saveAttempted=false;
    if(r.error)throw Error(r.error.code==="P0001"?r.error.message:"Unable to submit this deposit.");
  } catch(error){if(path&&!saveAttempted)await db.storage.from(BUSINESS_BUCKET).remove([path]);return {error:error instanceof Error?error.message:"Unable to submit."};}
  revalidatePath("/account/business");revalidatePath("/account/portal/business");revalidatePath("/admin/business-verification/deposits");
  return {success:"Deposit submitted. Your wallet is credited only after the bank receipt is confirmed."};
}
