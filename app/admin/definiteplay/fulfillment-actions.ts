"use server";
import { revalidatePath } from "next/cache";
import { requireDefinitePlayAdmin, validProductId } from "@/lib/definiteplay-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { supplierDeliveryEnabled } from "@/lib/definiteplay-fulfillment";
import { getDefinitePlayMappings, getDefinitePlayStatus } from "@/lib/definiteplay-relay";

export async function configureSupplierDelivery(productId: string, enabled: boolean): Promise<{error?: string; success?: boolean}> {
  await requireDefinitePlayAdmin();
  if (!validProductId(productId) || typeof enabled !== "boolean") return {error:"Invalid product."};
  if (!supplierDeliveryEnabled()) return {error:"Supplier delivery setup must be completed first."};
  try {
    const mappings = enabled ? (await getDefinitePlayMappings(productId)).mappings : [];
    if (enabled) {
      const status = await getDefinitePlayStatus();
      if (!status.fulfillmentReady || status.stale) return {error:"The supplier delivery service is not ready. Refresh and try again."};
      if (!mappings.length || mappings.some(m => !m.supplier || m.supplier.currency !== "USD")) {
        return {error:"Link each option to a supplier product priced in USD first."};
      }
    }
    const result = await createAdminClient().rpc("configure_definiteplay_product", {
      p_product_id:productId,p_enabled:enabled,
      p_mappings:mappings.map(m=>({optionId:m.option_id,sku:m.sku}))
    });
    if (result.error) return {error:"Unable to change delivery mode. Resolve outstanding supplier orders and check that every active option is linked and has no uploaded stock."};
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    revalidatePath(`/admin/products/${productId}/edit/stock`);
    return {success:true};
  } catch { return {error:"Supplier delivery connection is unavailable."}; }
}
