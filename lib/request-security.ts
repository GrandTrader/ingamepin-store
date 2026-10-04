import "server-only";
import { createHmac } from "node:crypto";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export function securityHash(value: string) {
  const secret = process.env.GUEST_PURCHASE_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw Error("Security configuration unavailable.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || origin === new URL(request.url).origin);
}

export async function consumeRate(scope: string, identity: string, limit: number, seconds: number) {
  const result = await createAdminClient().rpc("consume_security_rate", { p_key: securityHash(`${scope}:${identity}`), p_limit: limit, p_seconds: seconds });
  if (result.error || typeof result.data !== "boolean") throw Error("Security check unavailable.");
  return result.data;
}

export async function requestLimit(request: Request, scope: string, limit: number, seconds: number) {
  const ip = trustedClientIp(request.headers);
  if (!ip) return privateJson({ error: "Unable to verify this request. Please try again." }, 503);
  if (!(await consumeRate(scope, ip, limit, seconds))) {
    const response = privateJson({ error: "Too many attempts. Please wait before trying again." }, 429);
    response.headers.set("Retry-After", String(seconds));
    return response;
  }
  return null;
}
