import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountDetailBinding, encryptAccountDetail } from "@/lib/account-detail-crypto";
import { isSensitiveCustomerField } from "@/lib/sensitive-customer-fields";
import { consumeRate, privateJson, sameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    if (!request.headers.get("origin") || !sameOrigin(request)) return privateJson({ error: "Invalid request origin." }, 403);
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at) return privateJson({ error: "Sign in with a verified InGamePin account before providing account details." }, 401);
    if (!(await consumeRate("protected-account-details", user.id, 30, 3600))) return privateJson({ error: "Too many attempts. Please wait before trying again." }, 429);
    const raw = await request.text();
    if (raw.length > 30000) return privateJson({ error: "Too many account details." }, 400);
    const body = JSON.parse(raw);
    if (!uuid.test(body.productId) || body.authorized !== true || !Array.isArray(body.units) || body.units.length < 1 || body.units.length > 20) return privateJson({ error: "Confirm your authorization and enter the required details. Maximum 20 accounts per checkout." }, 400);
    const admin = createAdminClient();
    const [product, fields] = await Promise.all([
      admin.from("products").select("id,status").eq("id", body.productId).maybeSingle(),
      admin.from("product_customer_fields").select("id,label,is_required").eq("product_id", body.productId),
    ]);
    if (product.error || fields.error || product.data?.status !== "ACTIVE") return privateJson({ error: "This product is unavailable." }, 400);
    const protectedFields = (fields.data || []).filter(f => isSensitiveCustomerField(f.label));
    if (!protectedFields.length) return privateJson({ error: "This product does not require protected details." }, 400);
    const rows = [];
    const references: Record<string, string>[] = [];
    for (const unit of body.units) {
      if (!unit || typeof unit !== "object" || Array.isArray(unit) || Object.keys(unit).some(id => !protectedFields.some(f => f.id === id))) return privateJson({ error: "Invalid account details." }, 400);
      const result: Record<string, string> = {};
      for (const field of protectedFields) {
        const value = unit[field.id];
        if ((value == null || value === "") && !field.is_required) continue;
        if (typeof value !== "string" || !value.trim() || value.length > 500) return privateJson({ error: `Enter ${field.label}.` }, 400);
        const id = randomUUID();
        rows.push({ id, user_id: user.id, product_id: body.productId, field_id: field.id,
          ciphertext: encryptAccountDetail(value, accountDetailBinding(id, user.id, body.productId, field.id)),
          expires_at: new Date(Date.now() + 24 * 3600000).toISOString(), consent_at: new Date().toISOString() });
        result[field.id] = `protected:${id}`;
      }
      references.push(result);
    }
    if (!rows.length) return privateJson({ references });
    const result = await admin.from("protected_account_details").insert(rows);
    if (result.error) return privateJson({ error: "Protected storage is unavailable. No account details were added to your cart." }, 503);
    return privateJson({ references });
  } catch {
    // Never log or echo the request, credentials, or database response.
    return privateJson({ error: "Unable to protect account details. Please try again." }, 503);
  }
}
