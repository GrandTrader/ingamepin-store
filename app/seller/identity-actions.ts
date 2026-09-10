"use server";
import {diditConfig} from "@/lib/didit-config";
import {syncDiditLiveResult} from "@/lib/didit-live-result";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {summarizeDiditDecision} from "@/lib/didit-decision";
type State={error:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function hostedUrl(value:unknown):string|null {try{const u=new URL(String(value));return u.protocol==="https:" && u.hostname==="verify.didit.me" && !u.username && !u.password && u.pathname.startsWith("/session/") ? u.href : null;}catch{return null;}}
async function context() {
  const session=await createClient();const {data:{user}}=await session.auth.getUser();
  if(!user?.email_confirmed_at) throw Error("Sign in with a verified email account.");
  const db=createAdminClient();const result=await db.from("seller_accounts").select("id,status,submitted_at,first_name,surname").eq("user_id",user.id).maybeSingle();
  if(result.error || !result.data || result.data.status!=="PENDING" || !result.data.submitted_at) throw Error("Submit your seller application before starting identity verification.");
  const config=diditConfig();const {key,workflow}=config;
  if(!key || !workflow || !uuid.test(workflow)) throw Error("Identity verification is not configured yet.");
  return {db,seller:result.data,key,workflow,config};
}
async function api(path:string,key:string,body?:Record<string,unknown>) {
  const response=await fetch("https://verification.didit.me/v3/"+path,{method:body?"POST":"GET",headers:{"x-api-key":key,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw Error(response.status===429 ? "Too many attempts. Wait a minute and try again." : "Didit could not complete the request. Check the API key and workflow settings.");
  return await response.json();
}
export async function startSellerIdentity(_previous:State,form:FormData):Promise<State> {
  let destination:string|null=null;
  try {
    if(form.get("identity_consent")!=="accepted") return {error:"Accept the identity verification notice to continue."};
    const {db,seller,key,workflow,config}=await context();
    const found=await db.from(config.table).select("*").eq("seller_id",seller.id).eq("application_submitted_at",seller.submitted_at).eq("workflow_id",workflow).maybeSingle();
    if(found.error) throw Error("Identity session storage is not ready. Contact support.");
    if(found.data?.session_url){destination=hostedUrl(found.data.session_url);if(!destination)throw Error("Stored verification link is invalid.");}
    else {
      let row=found.data;
      if(!row){const added=await db.from(config.table).insert({seller_id:seller.id,application_submitted_at:seller.submitted_at,workflow_id:workflow,consent_version:config.environment+"-2026-09-11"}).select("*").single();if(added.error)throw Error("A verification may already be starting. Wait a moment and retry.");row=added.data;}
      else {
        if(Date.now()-Date.parse(row.updated_at)<60000)throw Error("Verification is starting. Wait a minute and try again.");
        const claimed=await db.from(config.table).update({updated_at:new Date().toISOString()}).eq("id",row.id).eq("updated_at",row.updated_at).is("session_id",null).select("*").maybeSingle();if(claimed.error || !claimed.data)throw Error("Verification is already starting. Please retry shortly.");row=claimed.data;
      }
      const callback=process.env.NODE_ENV==="development"?"http://localhost:3000/seller":"https://www.ingamepin.com/seller";
      const created=await api("session/",key,{workflow_id:workflow,vendor_data:row.id,callback,callback_method:"both",expected_details:{first_name:seller.first_name,last_name:seller.surname}});
      // Check the environment through the authenticated API, never trust a browser callback.
      if(!uuid.test(String(created.session_id)) || created.workflow_id!==workflow || created.vendor_data!==row.id)throw Error("Didit returned an unexpected session.");
      const decision=await api("session/"+created.session_id+"/decision/",key);
      if(decision.environment!==config.environment || decision.session_id!==created.session_id || decision.workflow_id!==workflow || decision.vendor_data!==row.id)throw Error("The verification environment or session does not match the configured connection.");
      destination=hostedUrl(created.url);if(!destination)throw Error("Didit returned an invalid verification link.");
      const saved=await db.from(config.table).update({session_id:created.session_id,session_url:destination,provider_status:"Not Started",updated_at:new Date().toISOString()}).eq("id",row.id).is("session_id",null).select("id").maybeSingle();
      if(saved.error || !saved.data)throw Error("Unable to save your verification link. Please retry after a minute.");
    }
  }catch(error){return {error:error instanceof Error ? error.message : "Unable to start verification."};}
  redirect(destination!);
}
export async function checkSellerIdentity(_previous:State,_form:FormData):Promise<State> {
  void _previous; void _form;
  try {
    const {db,seller,key,workflow,config}=await context();
    const found=await db.from(config.table).select("*").eq("seller_id",seller.id).eq("application_submitted_at",seller.submitted_at).eq("workflow_id",workflow).maybeSingle();
    const row=found.data;if(found.error || !row?.session_id)throw Error("Start identity verification first.");
    if(row.checked_at && Date.now()-Date.parse(row.checked_at)<10000)throw Error("Wait a few seconds before checking again.");
    if(config.live){await syncDiditLiveResult(row.session_id);revalidatePath("/seller");revalidatePath("/admin/sellers/"+seller.id);return {error:""};}
    const decision=await api("session/"+row.session_id+"/decision/",key);
    if(decision.session_id!==row.session_id || decision.environment!=="sandbox" || decision.vendor_data!==row.id || decision.workflow_id!==workflow)throw Error("The verification result does not match this application.");
    const summary=summarizeDiditDecision(decision);
    const saved=await db.from(config.table).update({...summary,checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id).eq("updated_at",row.updated_at).select("id").maybeSingle();
    if(saved.error || !saved.data)throw Error("Result changed while checking. Please try again.");
    // Test results intentionally never update seller_accounts verification timestamps.
    revalidatePath("/seller");return {error:""};
  }catch(error){return {error:error instanceof Error ? error.message : "Unable to check verification."};}
}
