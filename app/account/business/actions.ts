"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/customer-account-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_BUCKET, businessDocumentLabels, parseBusinessDetails, readBusinessFile } from "@/lib/business-verification";

export async function submitBusinessApplication(form:FormData) {
  const {user}=await requireCustomer();
  if(!user.email_confirmed_at) return {error:"Verify your account email before applying."};
  const db=createAdminClient(); const paths:string[]=[];let saveAttempted=false;
  try {
    const details=parseBusinessDetails(form);
    const files=await Promise.all(Object.entries(businessDocumentLabels).map(async ([key,label])=>{try{return {key,file:await readBusinessFile(form.get(key))};}catch(error){throw Error(`${label}: ${error instanceof Error?error.message:"Upload a valid document."}`);}}));
    const existing=await db.from("business_kyb").select("status,revision").eq("user_id",user.id).maybeSingle();
    if(existing.error) return {error:"Business verification is not available yet. Contact support."};
    if(existing.data && !["REJECTED","REVOKED"].includes(existing.data.status)) return {error:"Your application is already submitted. Contact support to change it."};
    const documents:Record<string,string>={};
    for(const {key,file} of files) {
      const path=`${user.id}/${randomUUID()}.${file.ext}`;
      const upload=await db.storage.from(BUSINESS_BUCKET).upload(path,file.bytes,{contentType:file.mime,upsert:false});
      if(upload.error) throw Error("Unable to upload the documents securely. Please try again.");
      paths.push(path);documents[key]=path;
    }
    saveAttempted=true;
    const saved=await db.rpc("submit_business_kyb",{p_user:user.id,p_details:details,p_documents:documents,p_revision:existing.data?.revision??0});
    if(saved.error?.code==="P0001"||saved.error?.code==="23505")saveAttempted=false;
    if(saved.error) throw Error(saved.error.code==="P0001"?saved.error.message:"Unable to submit the application. Refresh and try again.");
  } catch(error) { if(paths.length&&!saveAttempted)await db.storage.from(BUSINESS_BUCKET).remove(paths);return {error:error instanceof Error?error.message:"Unable to apply."}; }
  revalidatePath("/account/business");revalidatePath("/admin/business-verification");
  return {success:"Application submitted. An administrator will review your personal and business documents."};
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
  revalidatePath("/account/business");revalidatePath("/admin/business-verification/deposits");
  return {success:"Deposit submitted. Your wallet is credited only after the bank receipt is confirmed."};
}
