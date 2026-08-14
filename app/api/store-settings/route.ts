import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const getCachedStoreSettings = unstable_cache(async () => {
  const settings = await createAdminClient()
    .from("payment_gateway_settings")
    .select("store_usd_rub_rate, store_usd_inr_rate")
    .eq("id", true)
    .maybeSingle();

  const rate = Number(settings.data?.store_usd_rub_rate ?? 85);
  const inrRate = Number(settings.data?.store_usd_inr_rate ?? 102);

  return {
    usdRubRate: Number.isFinite(rate) && rate > 0 ? rate : 85,
    usdInrRate: Number.isFinite(inrRate) && inrRate > 0 ? inrRate : 102,
  };
}, ["public-store-settings"], { revalidate: 300 });

export async function GET() {
  return NextResponse.json(
    await getCachedStoreSettings(),
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
