import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncFailedGatewayPayments } from "@/lib/payment-failure-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 24) return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await syncFailedGatewayPayments();
    return NextResponse.json({ checked: result.checked, released: result.releasedOrderIds.length, failed: result.failed },
      { status: result.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Payment status check unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
