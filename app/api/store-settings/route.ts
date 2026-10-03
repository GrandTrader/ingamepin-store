import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const rateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  const settings = await createAdminClient()
    .from("payment_gateway_settings")
    .select("store_usd_rub_rate, store_usd_inr_rate")
    .eq("id", true)
    .maybeSingle();

  if (settings.error) {
    return NextResponse.json(
      { error: "Exchange rates are temporarily unavailable." },
      { status: 503, headers: rateHeaders },
    );
  }

  const rate = Number(settings.data?.store_usd_rub_rate ?? 85);
  const inrRate = Number(settings.data?.store_usd_inr_rate ?? 102);

  return NextResponse.json(
    {
      usdRubRate: Number.isFinite(rate) && rate > 0 ? rate : 85,
      usdInrRate: Number.isFinite(inrRate) && inrRate > 0 ? inrRate : 102,
    },
    {
      headers: rateHeaders,
    },
  );
}
