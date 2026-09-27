"use server";

import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateSupplierPrices } from "@/lib/supplier-price-calculator";

export async function calculateGiftPortPrices(amounts: string[], currency: string, markup: string) {
  await requireGiftPortAdmin();
  // Read the current saved website rate on every calculation, without a guessed fallback.
  const settings = await createAdminClient().from("payment_gateway_settings")
    .select("store_usd_inr_rate,store_usd_rub_rate").eq("id", true).maybeSingle();
  if (settings.error) return { error: "Unable to load website exchange rates. Try again or enter prices manually." };
  try {
    return { result: calculateSupplierPrices(amounts, currency, markup, settings.data ?? {}) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to calculate selling prices." };
  }
}
