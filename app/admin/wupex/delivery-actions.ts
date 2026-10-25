"use server";
import { revalidatePath } from "next/cache";
import { requireWupexAdmin } from "@/lib/wupex-admin";
import { wupexConnectionId, WupexError } from "@/lib/wupex-api";
import { requireWupexCredentials } from "@/lib/wupex-storage";
import { assertWupexLive, syncWupexProduct, wupexDeliveryEnabled } from "@/lib/wupex-fulfillment";
import { wupexUuid } from "@/lib/wupex-import";
export async function configureWupexDelivery(productId: string, enabled: boolean) {
 const { db } = await requireWupexAdmin();
 try {
  if (!wupexUuid(productId) || typeof enabled !== "boolean") throw new WupexError("Choose a valid product.");
  const credentials = await requireWupexCredentials();
  if (enabled) { assertWupexLive(credentials); if (!wupexDeliveryEnabled()) throw new WupexError("The Wupex delivery worker is not enabled."); await syncWupexProduct(db, credentials, productId); }
  const links = await db.from("wupex_product_links").select("supplier_snapshot").eq("product_id", productId);
  if (links.error || !links.data?.length) throw new WupexError("Import Wupex product links first.");
  const kind = links.data[0].supplier_snapshot.cardType === "voucher" ? "CODE" : "ACCOUNT";
  const result = await db.rpc("configure_wupex_product", { p_product_id: productId, p_enabled: enabled, p_kind: kind, p_connection: wupexConnectionId(credentials) });
  if (result.error) {
   const safe = ["Resolve existing supplier orders first", "Start the Wupex delivery worker first", "Restore the imported customer fields first", "Link every fixed option first", "Use a separate supplier product", "Delivery type does not match supplier products"];
   throw new WupexError(safe.includes(result.error.message) ? result.error.message : "Delivery settings could not be saved. Check the database setup and original supplier account.");
  }
  if (enabled) await syncWupexProduct(db, credentials, productId);
  revalidatePath("/admin/products/" + productId + "/edit/supplier"); return { success: true };
 } catch (error) { return { error: error instanceof WupexError ? error.message : "Unable to update Wupex delivery." }; }
}
export async function saveWupexMarkup(productId: string, markup: string) {
 const { db } = await requireWupexAdmin();
 try {
  if (!wupexUuid(productId) || typeof markup !== "string" || !/^\d{1,4}(\.\d{1,2})?$/.test(markup) || Number(markup) > 1000) throw new WupexError("Markup must be between 0% and 1,000%.");
  const credentials = await requireWupexCredentials();
  const result = await db.rpc("set_wupex_markup", { p_product_id: productId, p_connection: wupexConnectionId(credentials), p_markup: Number(markup) });
  if (result.error) throw new WupexError("The markup could not be saved. Check the original Wupex connection.");
  revalidatePath("/admin/products/" + productId + "/edit/supplier"); return { success: true };
 } catch (error) { return { error: error instanceof WupexError ? error.message : "Unable to save the markup." }; }
}
export async function refreshWupexProduct(productId: string) {
 const { db } = await requireWupexAdmin();
 try {
  if (!wupexUuid(productId)) throw new WupexError("Choose a valid product.");
  await syncWupexProduct(db, await requireWupexCredentials(), productId);
  revalidatePath("/admin/products/" + productId + "/edit/supplier"); return { success: true };
 } catch (error) { return { error: error instanceof WupexError ? error.message : "Unable to refresh Wupex prices and stock." }; }
}
