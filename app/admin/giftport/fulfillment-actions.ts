"use server";
import { revalidatePath } from "next/cache";
import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { validProductId } from "@/lib/definiteplay-admin";
import { getGiftPortStatus, giftPortRequest } from "@/lib/giftport-relay";
import { giftPortAmount, giftPortAmountAllowed } from "@/lib/giftport-import";
import type { GiftPortMapping } from "@/lib/giftport-types";

export async function saveGiftPortRecipient(form: FormData) {
  await requireGiftPortAdmin();
  const recipient_name = String(form.get("name") ?? "").trim();
  const recipient_email = String(form.get("email") ?? "").trim().toLowerCase();
  const mobile = String(form.get("mobile") ?? "").trim();
  if (!recipient_name || recipient_name.length > 150 || /[\r\n]/.test(recipient_name) || recipient_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email) || !/^[0-9]{10,15}$/.test(mobile)) return { error: "Enter your business name, email and mobile number (10–15 digits)." };
  const result = await createAdminClient().from("giftport_settings").upsert({ id: true, recipient_name, recipient_email, mobile, updated_at: new Date().toISOString() });
  if (result.error) return { error: "Unable to save recipient details. Check that the GiftPort database update is installed." };
  revalidatePath("/admin/giftport");
  return { success: true };
}

export async function configureGiftPortDelivery(productId: string, enabled: boolean, form: FormData) {
  await requireGiftPortAdmin();
  if (!validProductId(productId) || typeof enabled !== "boolean") return { error: "Choose a valid product." };
  const admin = createAdminClient();
  try {
    const mappings: {optionId: string; operatorCode: string; amount: string; unitCost: number; limit: number}[] = [];
    if (enabled) {
      const status = await getGiftPortStatus();
      if (!status.purchasingEnabled || !status.fulfillmentReady || status.stale) return { error: "GiftPort delivery setup must be running and the catalogue refreshed before enabling this product." };
      const budget = Number(form.get("budget"));
      const limit = Number(form.get("limit"));
      if (!Number.isFinite(budget) || budget <= 0 || budget > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100 || form.get("confirmed") !== "on") return { error: "Enter the full supplier cost budget in USD per 100 INR, a purchase limit (1–100), and confirm the budget includes fees." };
      const links = (await giftPortRequest<{mappings: GiftPortMapping[]}>("links", {operation: "list", productId})).mappings;
      const options = await admin.from("product_options").select("id,denomination,denomination_currency").eq("product_id", productId).eq("is_active", true);
      if (options.error || !options.data?.length) return { error: "Add and link active product options first." };
      for (const option of options.data) {
        const link = links.find(l => l.option_id === option.id);
        const item = status.snapshot?.items.find(i => i.operatorCode === link?.operator_code);
        const amount = giftPortAmount(String(option.denomination));
        if (!link || !item || option.denomination_currency !== "INR" || giftPortAmount(link.amount) !== amount || !giftPortAmountAllowed(item, amount)) return { error: "Link every active option to its correct GiftPort INR denomination first." };
        mappings.push({ optionId: option.id, operatorCode: link.operator_code, amount, unitCost: Math.ceil(Number(amount) * budget / 100 * 1e8) / 1e8, limit });
      }
    }
    const result = await admin.rpc("configure_giftport_product", {p_product_id: productId, p_enabled: enabled, p_mappings: mappings});
    if (result.error) return { error: "Unable to change delivery. Check business recipient details, resolve pending supplier orders, and remove available/reserved uploaded stock before enabling." };
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    return { success: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "GiftPort delivery setup failed." }; }
}
