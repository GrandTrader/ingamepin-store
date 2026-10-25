"use server";
import { revalidatePath } from "next/cache";
import { requireWupexAdmin } from "@/lib/wupex-admin";
import { findWupexProducts, getWupexBalance, getWupexFields, wupexConnectionId, WupexError } from "@/lib/wupex-api";
import { requireWupexCredentials } from "@/lib/wupex-storage";
import { prepareWupexDraft, wupexUuid, type WupexImportInput, type WupexImportProduct } from "@/lib/wupex-import";
import type { WupexAction } from "@/lib/wupex-types";
export type WupexImportSetup = { connection: string; products: WupexImportProduct[]; categories: { id: string; name: string }[]; query: string };
export async function loadWupexImport(ids: number[], query: string): Promise<WupexAction<WupexImportSetup>> {
 const { db } = await requireWupexAdmin();
 try {
  if (!Array.isArray(ids) || ids.length > 20 || typeof query !== "string" || query.length > 150) throw new WupexError("Select up to 20 supplier products.");
  const credentials = await requireWupexCredentials();
  const [products, categories, balance] = await Promise.all([
   findWupexProducts(credentials, ids, query),
   db.from("categories").select("id,name").eq("is_active", true).in("category_type", ["GIFT_CARD", "GAME_KEY", "SUBSCRIPTION", "DIGITAL_PRODUCT", "GAME_TOPUP"]).order("name"),
   getWupexBalance(credentials),
  ]);
  if (balance.currency !== "USD") throw new WupexError("Wupex imports require a verified USD supplier account.");
  if (categories.error || products.length !== new Set(ids).size) throw new WupexError("The selected products or website categories could not be loaded.");
  const enriched = await Promise.all(products.map(async p => ({ ...p, fields: await getWupexFields(credentials, p) })));
  if (new Set(enriched.map(p => p.cardType)).size !== 1 || new Set(enriched.map(p => p.subType)).size !== 1) throw new WupexError("Import products with the same delivery type together.");
  return { data: { connection: wupexConnectionId(credentials), products: enriched, categories: categories.data ?? [], query } };
 } catch (error) { return { error: error instanceof WupexError ? error.message : "Unable to prepare the Wupex import." }; }
}
export async function importWupexProduct(input: WupexImportInput): Promise<WupexAction<{ productId: string }>> {
 const { db, userId } = await requireWupexAdmin();
 try {
  if (!input || !wupexUuid(input.requestId) || !wupexUuid(input.categoryId) || !Array.isArray(input.options) || !input.options.length || input.options.length > 20) throw new WupexError("Choose a category and valid supplier products.");
  const credentials = await requireWupexCredentials(), connection = wupexConnectionId(credentials);
  if (input.connectionId !== connection) throw new WupexError("The Wupex connection changed. Reload the import.");
  const previous = await db.from("wupex_imports").select("product_id,connection_id,imported_by").eq("product_id", input.requestId).maybeSingle();
  if (previous.error) throw new WupexError("Install the Wupex database update first.");
  if (previous.data) {
   if (previous.data.connection_id !== connection || previous.data.imported_by !== userId) throw new WupexError("This import reference is already used.");
   return { data: { productId: previous.data.product_id } };
  }
  const [products, balance] = await Promise.all([findWupexProducts(credentials, input.options.map(o => o.id), input.query), getWupexBalance(credentials)]);
  const enriched = await Promise.all(products.map(async p => ({ ...p, fields: await getWupexFields(credentials, p) })));
  let draft;
  try { draft = prepareWupexDraft(input, enriched, balance.currency); }
  catch (error) { throw new WupexError(error instanceof Error ? error.message : "Check the import settings."); }
  const result = await db.rpc("import_wupex_draft", { p_product_id: input.requestId, p_category_id: input.categoryId, p_connection_id: connection, p_admin_id: userId, p_draft: draft });
  if (result.error || result.data?.productId !== input.requestId) throw new WupexError(result.error?.code === "23505" ? "A selected Wupex product has already been imported." : "The draft could not be confirmed. Retry here to check the same import.");
  revalidatePath("/admin/products"); revalidatePath("/admin/wupex");
  return { data: { productId: input.requestId } };
 } catch (error) { return { error: error instanceof WupexError ? error.message : "The draft could not be confirmed. Retry here to check the same import." }; }
}
export async function listWupexImports(page: number) {
 const { db } = await requireWupexAdmin();
 if (!Number.isInteger(page) || page < 1 || page > 10000) return { error: "Choose a valid page." };
 const result = await db.from("wupex_imports").select("product_id,markup_percent,products(name,status)", { count: "exact" }).order("created_at", { ascending: false }).order("product_id").range((page - 1) * 20, page * 20 - 1);
 if (result.error) return { error: "Install the Wupex database update to view imports." };
 return { data: (result.data ?? []).map(r => { const p = Array.isArray(r.products) ? r.products[0] : r.products; return { id: r.product_id, markup: Number(r.markup_percent), name: p?.name ?? "Product", status: p?.status ?? "Unknown" }; }), total: result.count ?? 0 };
}
