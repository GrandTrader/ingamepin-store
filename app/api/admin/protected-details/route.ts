import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { accountDetailBinding, decryptAccountDetail } from "@/lib/account-detail-crypto";
import { consumeRate, privateJson, sameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!request.headers.get("origin") || !sameOrigin(request)) return privateJson({ error: "Invalid request origin." }, 403);
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || !(await hasRequiredAdminAssurance(client))) return privateJson({ error: "Administrator verification is required." }, 401);
    const access = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (access.error || !access.data) return privateJson({ error: "Administrator access is required." }, 403);
    if (!(await consumeRate("protected-account-reveal", user.id, 120, 3600))) return privateJson({ error: "Too many requests." }, 429);
    const raw = await request.text();
    if (raw.length > 1024) return privateJson({ error: "Invalid request." }, 400);
    const body = JSON.parse(raw);
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(body.orderItemId) || !uuid.test(body.fieldId)) return privateJson({ error: "Invalid request." }, 400);
    const admin = createAdminClient();
    // The RPC locks the paid order, records access, and rejects expired details.
    const result = await admin.rpc("reveal_protected_account_detail", { p_admin: user.id, p_item: body.orderItemId, p_field: body.fieldId });
    if (result.error || !result.data) return privateJson({ error: "Details are unavailable, expired, or this order is not awaiting delivery." }, 409);
    const row = result.data;
    const value = decryptAccountDetail(row.ciphertext, accountDetailBinding(row.id, row.user_id, row.product_id, row.field_id));
    return privateJson({ value });
  } catch {
    return privateJson({ error: "Unable to reveal protected details." }, 503);
  }
}
