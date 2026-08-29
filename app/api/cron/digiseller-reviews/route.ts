import { NextRequest, NextResponse } from "next/server";

import { syncDigiSellerReviews } from "@/lib/digiseller-review-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncDigiSellerReviews()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DigiSeller review sync failed." },
      { status: 500 },
    );
  }
}
