import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await createAdminClient()
    .from("payment_gateway_settings")
    .select("store_usd_rub_rate")
    .eq("id", true)
    .maybeSingle();

  const rate = Number(settings.data?.store_usd_rub_rate ?? 85);

  return NextResponse.json(
    {
      usdRubRate: Number.isFinite(rate) && rate > 0 ? rate : 85,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
