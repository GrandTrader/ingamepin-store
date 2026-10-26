import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { sameOrigin } from "@/lib/request-security";
import { CustomerReportError, loadCustomerReport, REPORT_TIME_ZONES } from "@/lib/customer-report-data";
import { createCustomerReportPdf } from "@/lib/customer-report-pdf";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const failed=(error:string,status:number)=>Response.json({error},{status,headers});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return failed("Open the report from the customer profile.",403);
 const session=await createClient(),auth=await session.auth.getUser();
 if(auth.error||!auth.data.user)return failed("Please sign in as an administrator.",401);
 const access=await session.from("admin_users").select("user_id").eq("user_id",auth.data.user.id).maybeSingle();
 if(access.error||!access.data||!await hasRequiredAdminAssurance(session))return failed("Administrator access and verified two-step sign-in are required.",403);
 const {id}=await params,query=new URL(request.url).searchParams,timeZone=query.get("timezone")||"Asia/Kolkata";
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)||query.getAll("timezone").length>1||!Object.hasOwn(REPORT_TIME_ZONES,timeZone))return failed("Choose a valid customer and report time zone.",400);
 try{
  const data=await loadCustomerReport(createAdminClient(),id,timeZone,request.signal);
  const bytes=await createCustomerReportPdf(data);
  return new Response(Buffer.from(bytes),{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="customer-report-${id.slice(0,8)}-${data.generatedAt.slice(0,10)}.pdf"`}});
 }catch(error){return failed(error instanceof CustomerReportError?error.message:"The complete report could not be generated. Please try again.",error instanceof CustomerReportError?error.status:503);}
}
