import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runFKDeliveryTick } from "@/lib/fkwallet-fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 24) return NextResponse.json({ error: "Delivery scheduler is not configured." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...await runFKDeliveryTick() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "FKWallet delivery check failed. Review the connection and worker setup." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
