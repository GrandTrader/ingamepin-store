import type { ComponentProps } from "react";
import { listDigiSellerProducts } from "@/lib/digiseller-api";
import DigiSellerMapping from "./DigiSellerMapping";
import DigiSellerPricing from "./DigiSellerPricing";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function DigiSellerConnection({ productId, options }: Pick<ComponentProps<typeof DigiSellerMapping>, "productId" | "options">) {
  const [result,settings] = await Promise.all([listDigiSellerProducts(AbortSignal.timeout(10000))
    .then((products) => ({ products, error: undefined }))
    .catch(() => ({ products: [], error: "DigiSeller is currently unavailable. Refresh to retry." })),
    createAdminClient().from('digiseller_price_settings').select('adjustment_percent,last_synced_at,recovery_snapshot').eq('product_id',productId).maybeSingle(),
  ]);
  return <><DigiSellerPricing productId={productId} initialPercent={Number(settings.data?.adjustment_percent??0)} ready={!settings.error} needsRecovery={!!settings.data?.recovery_snapshot} lastSynced={settings.data?.last_synced_at??null}/><DigiSellerMapping productId={productId} options={options} products={result.products} loadError={result.error} /></>;
}
