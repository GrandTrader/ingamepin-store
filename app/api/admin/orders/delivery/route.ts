import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { saveManualDeliveryCodes } from "@/lib/manual-code-delivery";

export const runtime = "nodejs";
export const maxDuration = 60;
const maximumBytes = 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(error: string, status: number) {
  return NextResponse.json({error, success: ""}, {status, headers: {"Cache-Control": "private, no-store"}});
}
export async function POST(request: NextRequest) {
  // A cookie-authenticated write must originate on this site, like the former Server Action.
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply("Open the order on this website and try again.", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply("Invalid upload format.", 415);
  if (Number(request.headers.get("content-length")) > maximumBytes) return reply("Upload up to 1 MB of code text at a time.", 413);
  try {
    const session = await createClient();
    const {data: {user}, error} = await session.auth.getUser();
    if (error || !user || !(await hasRequiredAdminAssurance(session))) {
      return reply("Your admin session expired or needs verification. Sign in to admin in another tab, then retry here. Your codes are kept.", 401);
    }
    const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (access.error || !access.data) return reply("Administrator access is required.", 403);
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maximumBytes) return reply("Upload up to 1 MB of code text at a time.", 413);
    let body: {orderId?: unknown; itemId?: unknown; codes?: unknown};
    try { body = JSON.parse(text); } catch { return reply("Invalid upload format.", 400); }
    if (!body || typeof body !== "object" || typeof body.orderId !== "string" || !uuid.test(body.orderId) || typeof body.itemId !== "string" || !uuid.test(body.itemId) || typeof body.codes !== "string" || !body.codes.trim()) {
      return reply("Select a valid order item and enter delivery codes.", 400);
    }
    const form = new FormData();
    form.set("order_id", body.orderId); form.set("item_id", body.itemId); form.set("codes", body.codes);
    const result = await saveManualDeliveryCodes(form, user.id);
    return NextResponse.json(result, {status: result.error ? 400 : 200, headers: {"Cache-Control": "private, no-store"}});
  } catch {
    // Do not log digital codes or claim the transaction failed after a lost response.
    return reply("Could not confirm the upload result. Your codes are kept. Retry the same codes; already saved codes will be skipped.", 503);
  }
}
