import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { BUSINESS_BUCKET, businessDocumentLabels, safeBusinessPath } from "@/lib/business-verification";
export const runtime="nodejs";
export async function GET(request:NextRequest) {
  const session=await createClient();const {data:{user}}=await session.auth.getUser();
  const denied=()=>Response.json({error:"Document unavailable."},{status:404,headers:{"Cache-Control":"private, no-store"}});
  if(!user)return denied();
  const id=request.nextUrl.searchParams.get("id")??"",type=request.nextUrl.searchParams.get("type"),kind=request.nextUrl.searchParams.get("kind")??"";
  if(!/^[a-f0-9-]{36}$/i.test(id))return denied();
  const db=createAdminClient();let path:string|undefined,owner:string|undefined;
  if(type==="kyb"&&Object.hasOwn(businessDocumentLabels,kind)) {
    const r=await db.from("business_kyb").select("user_id,documents").eq("user_id",id).maybeSingle();
    if(r.error||!r.data)return denied();owner=r.data.user_id;path=r.data.documents?.[kind];
  } else if(type==="deposit") {
    const r=await db.from("business_bank_deposits").select("user_id,receipt_path").eq("id",id).maybeSingle();
    if(r.error||!r.data)return denied();owner=r.data.user_id;path=r.data.receipt_path;
  }
  if(!path||!owner||!safeBusinessPath(path,owner))return denied();
  if(owner!==user.id) {
    const admin=await session.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if(admin.error||!admin.data||!(await hasRequiredAdminAssurance(session)))return denied();
  }
  const download=await db.storage.from(BUSINESS_BUCKET).download(path);if(download.error||!download.data)return denied();
  const ext=path.split(".").pop();
  return new Response(download.data,{headers:{"Content-Type":ext==="pdf"?"application/pdf":ext==="png"?"image/png":"image/jpeg","Content-Disposition":`attachment; filename="business-document.${ext}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
}
