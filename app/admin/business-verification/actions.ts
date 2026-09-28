"use server";
import { revalidatePath } from "next/cache";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankFields } from "@/lib/business-verification";
function refresh() { for(const path of ["/account/business","/account/wallet","/account/dashboard","/admin/business-verification","/admin/business-verification/deposits"])revalidatePath(path); }
export async function reviewBusinessApplication(form:FormData) {
  const user=await requireBusinessAdmin();
  const status=String(form.get("status")??"");
  if(status==="APPROVED"&&form.get("checked")!=="yes")return {error:"Confirm that you reviewed the business details, ownership and documents."};
  const r=await createAdminClient().rpc("review_business_kyb",{p_user:String(form.get("user_id")??""),p_admin:user.id,p_revision:Number(form.get("revision")),p_status:status,p_note:String(form.get("note")??"").trim()});
  if(r.error)return {error:r.error.code==="P0001"?r.error.message:"Unable to save the review."};
  refresh();return {success:"Business verification updated."};
}
export async function saveBusinessBankSettings(form:FormData) {
  const user=await requireBusinessAdmin(); const instructions:Record<string,string>={};
  for(const [key] of bankFields) {const value=String(form.get(key)??"").trim();if(value.length>1500)return {error:"Bank instruction fields must be at most 1,500 characters."};instructions[key]=value;}
  instructions.swift=instructions.swift.toUpperCase();
  instructions.bank_confirmed=form.get("bank_confirmed")==="yes"?"yes":"no";
  const r=await createAdminClient().rpc("save_business_bank_settings",{p_admin:user.id,p_enabled:form.get("enabled")==="yes",p_instructions:instructions});
  if(r.error)return {error:r.error.code==="P0001"?r.error.message:"Unable to save bank settings."};
  revalidatePath("/admin/business-verification/bank-settings");refresh();return {success:"Bank transfer settings saved."};
}
export async function reviewBusinessDeposit(form:FormData) {
  const user=await requireBusinessAdmin();const status=String(form.get("status")??"");
  if(status==="CREDITED"&&form.get("confirmed")!=="yes")return {error:"Confirm the settled bank receipt before crediting the wallet."};
  const currency=String(form.get("currency")??"");
  const r=await createAdminClient().rpc("review_business_bank_deposit",{p_id:String(form.get("id")??""),p_admin:user.id,p_status:status,p_bank_reference:String(form.get("bank_reference")??"").trim(),p_currency:currency,p_received:Number(form.get("received")||0),p_rate:currency==="USD"?1:Number(form.get("rate")||0),p_note:String(form.get("note")??"").trim()});
  if(r.error)return {error:r.error.code==="P0001"?r.error.message:r.error.code==="23505"?"This bank reference has already been credited.":"Unable to review the deposit."};
  refresh();return {success:status==="CREDITED"?`USD ${Number(r.data).toFixed(2)} credited to the wallet.`:"Deposit rejected."};
}
