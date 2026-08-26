import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function authorizeBulkApi(request: NextRequest) {
  const configuredKey = process.env.BULK_API_KEY?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (configuredKey.length < 32 || supplied.length < 32) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const expected = createHash("sha256").update(configuredKey).digest();
  const actual = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

export function bulkApiNoStore<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}
