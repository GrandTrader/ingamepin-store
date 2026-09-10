import {syncDiditLiveResult} from "@/lib/didit-live-result";
import { authenticateDiditWebhook, diditEventMetadata } from "@/lib/didit-webhook";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
const limit = 1024 * 1024;
export async function POST(request: Request) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET?.trim();
  const liveSecret = process.env.DIDIT_LIVE_WEBHOOK_SECRET?.trim();
  if (!secret && !liveSecret) return Response.json({error:"Webhook not configured"},{status:503});
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response(null,{status:415});
  if (Number(request.headers.get("content-length")) > limit) return new Response(null,{status:413});
  const reader = request.body?.getReader();
  if (!reader) return new Response(null,{status:400});
  const chunks: Buffer[] = []; let size = 0;
  try {
    while (true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return new Response(null,{status:413});}chunks.push(Buffer.from(value));}
  } catch {return new Response(null,{status:400});}
  // Verify exact request bytes, never re-serialized JSON or the weaker Simple signature.
  const raw=Buffer.concat(chunks), signature=request.headers.get("x-signature"), timestamp=request.headers.get("x-timestamp");
  const liveEvent=liveSecret ? authenticateDiditWebhook(raw,signature,timestamp,liveSecret) : null;
  const sandboxEvent=secret ? authenticateDiditWebhook(raw,signature,timestamp,secret) : null;
  const event=liveEvent?.environment === "live" ? liveEvent : sandboxEvent && ["sandbox","test"].includes(String(sandboxEvent.environment)) ? sandboxEvent : null;
  if (!event) return Response.json({error:"Invalid webhook signature"},{status:401});
  if (event.webhook_type !== "status.updated" && event.webhook_type !== "data.updated") return Response.json({received:true,ignored:true});
  const metadata = diditEventMetadata(event);
  if (!metadata) return Response.json({error:"Invalid session event"},{status:400});
  // Authenticate each environment with its own key. Never apply the posted decision.
  try {
    const db=createAdminClient();
    const result = await db.from("didit_webhook_events").insert(metadata);
    if (result.error && result.error.code!=="23505") return Response.json({error:"Unable to record event"},{status:503});
    if (result.error?.code==="23505") {
      const previous=await db.from("didit_webhook_events").select("processed_at").eq("event_id",metadata.event_id).single();
      if(previous.error)return Response.json({error:"Unable to read event"},{status:503});
      if(previous.data.processed_at)return Response.json({received:true,duplicate:true});
    }
    if(metadata.environment==="live") {
      const processed=await syncDiditLiveResult(metadata.session_id,3000);
      if(processed){const saved=await db.from("didit_webhook_events").update({processed_at:new Date().toISOString()}).eq("event_id",metadata.event_id);if(saved.error)return Response.json({error:"Unable to finish event"},{status:503});}
    }
    return Response.json({received:true});
  } catch {return Response.json({error:"Unable to record event"},{status:503});}
}
