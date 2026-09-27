"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { validProductId } from "@/lib/definiteplay-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGiftPortStatus, giftPortRequest } from "@/lib/giftport-relay";
import { prepareGiftPortDraft, type GiftPortImportInput } from "@/lib/giftport-import";
import { UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";

export async function importGiftPortProduct(input: GiftPortImportInput): Promise<{ error?: string; productId?: string; warning?: string }> {
  const session = await requireGiftPortAdmin();
  if (!input || !validProductId(input.requestId || "") || !validProductId(input.categoryId || "")) return { error: "Choose a valid website category and import reference." };
  const productId = input.requestId.toLowerCase(), slug = "giftport-" + productId;
  const admin = createAdminClient();
  const existing = await admin.from("products").select("id,slug").eq("id", productId).maybeSingle();
  if (existing.error) return { error: "Unable to check previous imports. Try again." };
  if (existing.data) return existing.data.slug === slug ? { productId, warning: "This draft already exists. Review its options and supplier links; it has not been duplicated." } : { error: "Import reference already used. Reload the page." };
  const category = await session.from("categories").select("id,category_type").eq("id", input.categoryId).eq("is_active", true).maybeSingle();
  if (category.error || !category.data || !["GAME_TOPUP", "GAME_KEY", "GIFT_CARD", "SUBSCRIPTION", "DIGITAL_PRODUCT"].includes(category.data.category_type)) return { error: "Choose an active website category." };
  let draft;
  try {
    const status = await getGiftPortStatus();
    if (!status.configured || status.stale || !status.snapshot) throw new Error("Refresh the GiftPort catalogue before importing.");
    const item = status.snapshot.items.find(i => i.operatorCode === input.operatorCode);
    if (!item) throw new Error("This brand is no longer in the GiftPort catalogue.");
    draft = prepareGiftPortDraft(input, item);
  } catch (e) { return { error: e instanceof Error ? e.message : "Unable to validate supplier values." }; }
  const options = draft.options.map((o, index) => ({ id: randomUUID(), product_id: productId, category_id: input.categoryId,
    option_type: "CURRENCY", option_name: o.name, denomination: o.denomination, denomination_currency: "INR",
    selling_price: o.price, stock_quantity: 0, is_active: true, is_in_stock: false, is_custom_value: false, sort_order: index }));
  const created = await admin.from("products").insert({ id: productId, slug, category_id: input.categoryId,
    name: draft.title, name_ru: draft.titleRu || null, description: draft.description || null, description_ru: draft.descriptionRu || null,
    region: draft.region, product_type: category.data.category_type, delivery_type: "MANUAL", is_bulk_order: false,
    currency: "USD", price: Math.min(...draft.options.map(o => o.price)), stock_quantity: 0, status: "DRAFT", stock_source: "OWNED", is_featured: false,
    allows_fixed_values: true, allows_custom_value: false, allows_player_id_topup: false, allows_gaming_voucher: true,
    minimum_quantity: 1, maximum_quantity: UNLIMITED_STOCK_QUANTITY, sold_count: 0 });
  if (created.error) return { error: "Draft creation could not be confirmed. Retry this same import to check whether it was saved." };
  let warning = "", optionsSaved = false;
  try {
    const saved = await admin.from("product_options").insert(options);
    if (saved.error) throw new Error("options");
    optionsSaved = true;
    await giftPortRequest("links", { operation: "save", productId, mappings: options.map((o, i) => ({ optionId: o.id, operatorCode: input.operatorCode, amount: draft.options[i].amount, currency: "INR" })) });
  } catch {
    warning = optionsSaved ? "Draft and options saved, but supplier links need attention. Open the GiftPort Supplier tab to finish linking." : "Draft saved, but its options could not be saved. Review Product options before trying to publish.";
  }
  revalidatePath("/admin/products");
  return { productId, ...(warning ? { warning } : {}) };
}
