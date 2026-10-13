"use server";
import { revalidatePath } from "next/cache";
import { requireFKAdmin } from "@/lib/fkwallet-admin";
import { connectionId, FKError, fkRequest, parseProducts } from "@/lib/fkwallet-api";
import { fkDeliveryEnabled, syncFKProductStock } from "@/lib/fkwallet-fulfillment";
import { fkImportIssue, fkUuid } from "@/lib/fkwallet-import";
import { requireCredentials } from "@/lib/fkwallet-storage";

export async function configureFKDelivery(productId: string, enabled: boolean, kind: string): Promise<{ error?: string; success?: boolean }> {
  const { db } = await requireFKAdmin();
  if (!fkUuid(productId) || typeof enabled !== "boolean" || !["CODE", "ACCOUNT"].includes(kind)) return { error: "Choose a valid product and delivery type." };
  try {
    if (enabled && !fkDeliveryEnabled()) throw new FKError("The automatic delivery worker must be set up first.");
    const credentials = await requireCredentials();
    if (enabled) {
      const imp = await db.from("fkwallet_imports").select("connection_id,supplier_category_id").eq("product_id", productId).single();
      const links = await db.from("fkwallet_product_links").select("supplier_product_id,supplier_cost,supplier_currency").eq("product_id", productId);
      if (imp.error || links.error || imp.data.connection_id !== connectionId(credentials)) throw new FKError("Check the original FKWallet account and saved links.");
      const catalogue = parseProducts(await fkRequest(credentials, `op/categories/${imp.data.supplier_category_id}/products`));
      if (!links.data?.length || links.data.some(link => {
        const item = catalogue.find(row => row.id === Number(link.supplier_product_id));
        return !item || fkImportIssue(item) || item.currency !== link.supplier_currency || item.price > Number(link.supplier_cost);
      })) throw new FKError("A supplier product or price changed. Review the imported options before enabling delivery.");
    }
    const result = await db.rpc("configure_fkwallet_product", { p_product_id: productId, p_enabled: enabled, p_kind: kind, p_connection: connectionId(credentials) });
    if (result.error) throw new FKError("Delivery could not be changed. Install the database update, start the worker, and check for outstanding supplier orders or changed customer fields.");
    if (enabled) await syncFKProductStock(db, credentials, productId);
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    revalidatePath(`/admin/products/${productId}/edit/stock`);
    return { success: true };
  } catch (error) { return { error: error instanceof FKError ? error.message : "The FKWallet delivery settings could not be saved." }; }
}
