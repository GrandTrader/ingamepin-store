import type { ComponentProps } from "react";
import DigiSellerMapping from "./DigiSellerMapping";
import DigiSellerPricing from "./DigiSellerPricing";
import { createAdminClient } from "@/lib/supabase/admin";
import DigiSellerCustomerFields from "./DigiSellerCustomerFields";

export default async function DigiSellerConnection({ productId, options }: Pick<ComponentProps<typeof DigiSellerMapping>, "productId" | "options">) {
  const settings = await createAdminClient().from("digiseller_price_settings").select("adjustment_percent,last_synced_at,recovery_snapshot").eq("product_id", productId).maybeSingle();
  return <><DigiSellerPricing productId={productId} initialPercent={Number(settings.data?.adjustment_percent ?? 0)} ready={!settings.error} needsRecovery={!!settings.data?.recovery_snapshot} lastSynced={settings.data?.last_synced_at ?? null} /><DigiSellerCustomerFields productId={productId} optionIds={options.map(option => option.id)} digiIds={options.map(option => option.digisellerProductId)} /><DigiSellerMapping productId={productId} options={options} /></>;
}
