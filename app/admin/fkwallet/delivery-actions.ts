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
    if (result.error) {
      const messages: Record<string, string> = {
        "Restore the imported customer fields first": "The customer fields no longer match the FKWallet import. Restore their delivery links before enabling automatic delivery.",
        "Start the FKWallet delivery worker first": "The delivery worker has not checked in recently. Wait a minute and try again.",
        "Resolve existing supplier orders first": "Finish or review the outstanding supplier orders before changing delivery settings.",
        "Link every fixed option first": "Link every active product option to FKWallet before enabling automatic delivery.",
        "Account delivery requires recipient fields": "Account activation needs the imported recipient fields, such as Username.",
        "Use a separate supplier product": "This product has available or reserved codes. Use a separate product for FKWallet delivery.",
        "Invalid delivery setup": "Check the original FKWallet account and selected delivery method.",
        "Fixed imported options only": "Automatic delivery requires fixed imported options. Turn off custom values and player-ID top-up mode first.",
      };
      const missingUpdate = ["PGRST202", "42883", "42P01"].includes(result.error.code);
      throw new FKError(messages[result.error.message] ?? (missingUpdate
        ? "Install the FKWallet automatic delivery database update first."
        : "Delivery settings could not be saved. Refresh and try again."));
    }
    if (enabled) await syncFKProductStock(db, credentials, productId);
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    revalidatePath(`/admin/products/${productId}/edit/stock`);
    return { success: true };
  } catch (error) { return { error: error instanceof FKError ? error.message : "The FKWallet delivery settings could not be saved." }; }
}
