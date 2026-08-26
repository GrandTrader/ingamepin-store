import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export type BulkApiPrincipal = {
  clientId: string | null;
  clientName: string;
};

export async function authorizeBulkApi(request: NextRequest): Promise<
  { principal: BulkApiPrincipal; error: null } |
  { principal: null; error: NextResponse }
> {
  const configuredKey = process.env.BULK_API_KEY?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (supplied.length < 32) {
    return { principal: null, error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const actual = createHash("sha256").update(supplied).digest();
  if (configuredKey.length >= 32) {
    const expected = createHash("sha256").update(configuredKey).digest();
    if (timingSafeEqual(expected, actual)) {
      return { principal: { clientId: null, clientName: "Master" }, error: null };
    }
  }

  const keyHash = actual.toString("hex");
  const admin = createAdminClient();
  const result = await admin
    .from("bulk_api_clients")
    .select("id, name")
    .eq("key_hash", keyHash)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (result.error || !result.data) {
    return { principal: null, error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  await admin.from("bulk_api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", result.data.id);
  return { principal: { clientId: result.data.id, clientName: result.data.name }, error: null };
}

export function bulkApiNoStore<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}
