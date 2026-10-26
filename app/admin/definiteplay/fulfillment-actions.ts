"use server";
import { revalidatePath } from "next/cache";
import { requireDefinitePlayAdmin, validProductId } from "@/lib/definiteplay-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { supplierDeliveryEnabled } from "@/lib/definiteplay-fulfillment";
import { getDefinitePlayMappings, getDefinitePlayStatus, getDefinitePlayItems } from "@/lib/definiteplay-relay";
import type { SupplierSelection } from "@/lib/supplier-switch";
import { getFKWalletProductImport } from "@/lib/fkwallet-product-supplier";

export async function configureSupplierDelivery(productId: string, enabled: boolean): Promise<{error?: string; success?: boolean}> {
  await requireDefinitePlayAdmin();
  if (!validProductId(productId) || typeof enabled !== "boolean") return {error:"Invalid product."};
  if (enabled && !supplierDeliveryEnabled()) return {error:"Supplier delivery setup must be completed first."};
  try {
    if (await getFKWalletProductImport(productId)) return {error:"This product is linked to FKWallet. Definite Play delivery cannot be enabled for it."};
    const db=createAdminClient();
    let mappings: {option_id:string;sku:string;supplier?:{currency:string}|null}[]=[];
    if(enabled){
      const saved=await db.from("product_supplier_settings").select("provider,selection").eq("product_id",productId).maybeSingle();
      if(saved.error && !["PGRST205","42P01"].includes(saved.error.code))return {error:"Saved supplier setup could not be checked."};
      if(saved.data){
        if(saved.data.provider!=="DEFINITEPLAY")return {error:"Use Change supplier to switch this product to Definite Play."};
        const selection=saved.data.selection as SupplierSelection;
        const catalogue=await getDefinitePlayItems(selection.options.map(o=>o.key));
        if(catalogue.stale)return {error:"Refresh the supplier catalogue before enabling delivery."};
        mappings=selection.options.map(o=>({option_id:o.optionId||"",sku:o.key,supplier:catalogue.items.find(item=>item.sku===o.key)}));
      }else mappings=(await getDefinitePlayMappings(productId)).mappings;
    }
    if (enabled) {
      const status = await getDefinitePlayStatus();
      if (!status.fulfillmentReady || status.stale) return {error:"The supplier delivery service is not ready. Refresh and try again."};
      if (!mappings.length || mappings.some(m => !m.supplier || m.supplier.currency !== "USD")) {
        return {error:"Link each option to a supplier product priced in USD first."};
      }
    }
    const result = await db.rpc("configure_definiteplay_product", {
      p_product_id:productId,p_enabled:enabled,
      p_mappings:mappings.map(m=>({optionId:m.option_id,sku:m.sku}))
    });
    if (result.error) return {error:"Unable to change delivery mode. Resolve outstanding supplier orders and check that every active option is linked and has no uploaded stock."};
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    revalidatePath(`/admin/products/${productId}/edit/stock`);
    return {success:true};
  } catch { return {error:"Supplier delivery connection is unavailable."}; }
}
