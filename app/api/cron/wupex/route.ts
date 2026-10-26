import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runWupexDeliveryTick } from "@/lib/wupex-fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 24) return NextResponse.json({ error: "Delivery scheduler is not configured." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const backup = await createAdminClient().rpc("fulfill_uploaded_supplier_backups", { p_limit: 25 });
    if (backup.error) throw new Error("Uploaded backup delivery check failed.");
    const website = await runWupexDeliveryTick();
    const ok = website.stockFailed === 0;
    return NextResponse.json({ ok, uploadedBackupDeliveries: Number(backup.data ?? 0), ...website }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  catch { return NextResponse.json({ error: "Wupex delivery check failed. Review the connection and worker setup." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
