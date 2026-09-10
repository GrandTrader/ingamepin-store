import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {summarizeDiditDecision} from "@/lib/didit-decision";
export async function syncDiditLiveResult(sessionId:string, timeoutMs=15000) {
 const db=createAdminClient();
 const found=await db.from("didit_seller_live_sessions").select("*").eq("session_id",sessionId).maybeSingle();
 if(found.error)throw Error("Unable to read live verification session.");
 const row=found.data;if(!row)return false;
 const key=process.env.DIDIT_LIVE_API_KEY?.trim();if(!key)throw Error("Live verification is not configured.");
 const response=await fetch("https://verification.didit.me/v3/session/"+row.session_id+"/decision/",{headers:{"x-api-key":key},cache:"no-store",signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok)throw Error("Unable to retrieve live verification. Please retry.");
 const d=await response.json();
 if(d.environment!=="live" || d.session_id!==row.session_id || d.workflow_id!==row.workflow_id || d.vendor_data!==row.id)throw Error("Live result does not match the seller session.");
 const summary=summarizeDiditDecision(d);
 const applied=await db.rpc("apply_didit_live_result",{p_id:row.id,p_expected_updated_at:row.updated_at,p_provider_status:summary.provider_status,p_face_score:summary.face_score,p_passed:summary.checks_passed});
 if(applied.error || !applied.data)throw Error("Verification changed while checking. Please retry.");
 return true;
}
