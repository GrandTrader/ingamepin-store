import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessApiIp } from "./business-api-input";

export function businessApiJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function authorizeBusinessApi(request: Request, ordering = false) {
  const fail = (status: number, error: string) => ({ error: businessApiJson({ error }, status), principal: null });
  const token = request.headers.get("authorization")?.match(/^Bearer (igp_b2b_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return fail(401, "A valid business API key is required.");
  let ip: string | null;
  try { ip = businessApiIp(request.headers); } catch { return fail(403, "Unable to verify the caller IP address."); }
  if (!ip) return fail(503, "Trusted client IP detection is unavailable.");
  const db = createAdminClient();
  const result = await db.rpc("authorize_business_api", { p_hash: createHash("sha256").update(token).digest("hex"), p_ip: ip });
  if (result.error) {
    if (result.error.message.includes("business_api_rate_limit")) {
      const response = fail(429, "Rate limit reached. Retry in 60 seconds.");
      response.error.headers.set("Retry-After", "60");
      return response;
    }
    return fail(503, "Business API access is temporarily unavailable.");
  }
  if (!result.data?.userId) return fail(403, "Key expired, revoked, IP not allowed, or business access unavailable.");
  if (ordering && !result.data.canOrder) return fail(403, "This API key has read-only access.");
  const { data, error } = await db.auth.admin.getUserById(result.data.userId);
  if (error || !data.user?.email || !data.user.email_confirmed_at) return fail(403, "Business account unavailable.");
  return { error: null, principal: { user: data.user, ip, keyId: String(result.data.keyId) } };
}
