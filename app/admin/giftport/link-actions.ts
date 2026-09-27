"use server";
import { revalidatePath } from "next/cache";
import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { validProductId } from "@/lib/definiteplay-admin";
import { getGiftPortStatus, giftPortRequest } from "@/lib/giftport-relay";
import { giftPortAmount, giftPortAmountAllowed } from "@/lib/giftport-import";
import type { GiftPortItem } from "@/lib/giftport-types";

export async function searchGiftPort(query: string): Promise<{ items: GiftPortItem[]; stale?: boolean; error?: string }> {
  await requireGiftPortAdmin();
  if (typeof query !== "string" || query.trim().length < 2) return { items: [] };
  try { const s = await getGiftPortStatus(); const q = query.trim().slice(0, 200).toLowerCase(); return { items: (s.snapshot?.items || []).filter(i => `${i.brandName} ${i.operatorCode}`.toLowerCase().includes(q)).slice(0, 15), stale: s.stale }; }
  catch (e) { return { items: [], error: e instanceof Error ? e.message : "Search unavailable." }; }
}
export async function saveGiftPortLink(productId: string, optionId: string, operatorCode: string | null): Promise<{ error?: string; success?: boolean }> {
  const session = await requireGiftPortAdmin();
  if (!validProductId(productId || "") || !validProductId(optionId || "") || (operatorCode !== null && (typeof operatorCode !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(operatorCode)))) return { error: "Choose a valid product, option and brand." };
  const [product, option] = await Promise.all([
    session.from("products").select("id,stock_source").eq("id", productId).maybeSingle(),
    session.from("product_options").select("id,product_id,denomination,denomination_currency").eq("id", optionId).eq("product_id", productId).maybeSingle(),
  ]);
  if (product.error || option.error || !product.data || !option.data) return { error: "Unable to verify this product option." };
  if (product.data.stock_source !== "OWNED") return { error: "Switch this product to uploaded stock before changing supplier links." };
  try {
    if (operatorCode === null) await giftPortRequest("links", { operation: "remove", productId, optionId });
    else {
      const s = await getGiftPortStatus();
      if (s.stale || !s.configured) throw new Error("Refresh the GiftPort catalogue first.");
      const item = s.snapshot?.items.find(i => i.operatorCode === operatorCode);
      const amount = giftPortAmount(String(option.data.denomination));
      if (!item || option.data.denomination_currency !== "INR" || !giftPortAmountAllowed(item, amount)) throw new Error("This option's INR face value is not confirmed for the selected brand.");
      await giftPortRequest("links", { operation: "save", productId, mappings: [{ optionId, operatorCode, amount, currency: "INR" }] });
    }
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    return { success: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "Unable to save supplier link." }; }
}
