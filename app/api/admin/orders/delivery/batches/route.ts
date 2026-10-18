import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { readJsonBody, RequestBodyError } from "@/lib/read-json-body";
import { isReceiptId } from "@/lib/wallet-receipt";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
async function administrator() {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user || !(await hasRequiredAdminAssurance(session))) return null;
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  return access.error || !access.data ? null : user;
}
export async function GET(request: Request) {
  try {
    if (!(await administrator())) return reply({ error: "Administrator sign-in and verification are required." }, 403);
    const params = new URL(request.url).searchParams;
    const orderId = params.get("orderId") ?? "", batchId = params.get("batchId") ?? "", page = Number(params.get("page") ?? "1");
    if (!isReceiptId(orderId) || !isReceiptId(batchId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return reply({ error: "Choose a valid delivery batch." }, 400);
    const admin = createAdminClient();
    const batch = await admin.from("manual_delivery_batches").select("id,order_item_id,code_count,revoked_at").eq("id", batchId).eq("order_id", orderId).maybeSingle();
    if (batch.error) throw new Error("Batch unavailable");
    if (!batch.data) return reply({ error: "Delivery batch was not found for this order." }, 404);
    const result = await admin.from("gift_card_codes").select("id,code").eq("manual_delivery_batch_id", batchId).eq("order_item_id", batch.data.order_item_id).order("id").range((page - 1) * 100, page * 100 - 1);
    if (result.error) throw new Error("Codes unavailable");
    return reply({ codes: result.data ?? [], total: batch.data.code_count, revoked: Boolean(batch.data.revoked_at) });
  } catch { return reply({ error: "Unable to load batch codes. Please retry." }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Open this order on the website and retry." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ error: "Invalid request format." }, 415);
  try {
    const user = await administrator();
    if (!user) return reply({ error: "Administrator sign-in and verification are required." }, 403);
    const body = await readJsonBody(request, 4096) as { orderId?: unknown; batchId?: unknown; reason?: unknown; confirmed?: unknown } | null;
    if (!body || typeof body.orderId !== "string" || !isReceiptId(body.orderId) || typeof body.batchId !== "string" || !isReceiptId(body.batchId)
      || typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.trim().length > 500 || body.confirmed !== true) return reply({ error: "Choose a batch, enter a reason, and confirm revocation." }, 400);
    const result = await createAdminClient().rpc("revoke_manual_delivery_batch", { p_order_id: body.orderId, p_batch_id: body.batchId, p_admin_user_id: user.id, p_reason: body.reason.trim() });
    if (result.error) return reply({ error: result.error.code === "P0001" ? result.error.message : "Unable to revoke the batch. Refresh the order and retry." }, 400);
    for (const path of ["/admin/orders", "/admin/orders/" + body.orderId + "/receipt", "/account/orders", "/account/portal", "/account/orders/" + body.orderId, "/account/portal/orders/" + body.orderId]) revalidatePath(path);
    return reply({ success: result.data?.alreadyRevoked ? "This batch was already revoked. No additional codes were changed." : result.data?.revoked + " codes revoked. Send replacement codes for the reopened quantity." });
  } catch (error) {
    if (error instanceof RequestBodyError) return reply({ error: error.message }, error.status);
    return reply({ error: "Could not confirm the result. Refresh the order before retrying; the same batch cannot be revoked twice." }, 503);
  }
}
