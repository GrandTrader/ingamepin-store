"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUnlimitedStock, UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";

type SubmittedOption = { id: string; name: string; denomination: number; currency: string; sellingPrice: number; isActive: boolean; isInStock: boolean };

export async function saveProductOptions(formData: FormData) {
  const productId = String(formData.get("id") ?? "").trim();
  const path = `/admin/products/${productId}/edit/product-options`;
  const preserveDiscountedPrices = formData.get("preserve_discounted_prices") === "true";
  const requestedPriceChangePercent = Number(formData.get("price_reduction_percent") ?? 0);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  let options: SubmittedOption[];
  try { options = JSON.parse(String(formData.get("options") ?? "[]")) as SubmittedOption[]; }
  catch { redirect(`${path}?error=${encodeURIComponent("Product options are invalid.")}`); }
  if (!Array.isArray(options) || options.length === 0 || options.length > 50) redirect(`${path}?error=${encodeURIComponent("Keep at least one product option.")}`);
  if (options.some((option) => !option.name.trim() || !Number.isInteger(option.denomination) || option.denomination <= 0 || !/^[A-Z]{3}$/.test(option.currency) || !Number.isFinite(option.sellingPrice) || option.sellingPrice < 0)) redirect(`${path}?error=${encodeURIComponent("Complete every option with a valid denomination and selling price.")}`);

  const admin = createAdminClient();
  const product = await admin.from("products").select("category_id, stock_quantity").eq("id", productId).maybeSingle();
  if (!product.data) redirect(`${path}?error=${encodeURIComponent("Product not found.")}`);

  const submittedIds = options.map((option) => option.id).filter(Boolean);
  const existingResult = await admin.from("product_options").select("id, selling_price, is_active").eq("product_id", productId).eq("is_custom_value", false);
  if (existingResult.error) redirect(`${path}?error=${encodeURIComponent(existingResult.error.message)}`);

  let adjustedDiscounts: Array<{ id: string; discountPercent: number | null }> = [];

  if (preserveDiscountedPrices) {
    const currentOptions = (existingResult.data ?? []).filter((option) => option.is_active);
    const currentIds = new Set(currentOptions.map((option) => option.id));

    if (
      options.some((option) => !option.id || !currentIds.has(option.id)) ||
      currentOptions.some((option) => !submittedIds.includes(option.id))
    ) {
      redirect(`${path}?error=${encodeURIComponent("Price protection cannot add or remove options. Save structural changes separately first.")}`);
    }

    const newPriceById = new Map(options.map((option) => [option.id, option.sellingPrice]));
    const hasRequestedPriceChange = Number.isFinite(requestedPriceChangePercent) && Math.abs(requestedPriceChangePercent) > 0 && Math.abs(requestedPriceChangePercent) < 100;
    const requestedRatio = hasRequestedPriceChange ? 1 - requestedPriceChangePercent / 100 : null;
    const ratios = currentOptions.map((option) => {
      const oldPrice = Number(option.selling_price);
      const newPrice = Number(newPriceById.get(option.id));

      if (oldPrice <= 0 || newPrice <= 0 || (requestedRatio === null && newPrice > oldPrice)) {
        redirect(`${path}?error=${encodeURIComponent("Price protection requires positive prices and a proportional change.")}`);
      }
      if (requestedRatio !== null && newPrice !== Math.round(oldPrice * requestedRatio * 100) / 100) {
        redirect(`${path}?error=${encodeURIComponent("An option price changed after applying the percentage. Apply the percentage again before saving.")}`);
      }

      return newPrice / oldPrice;
    });
    const reductionRatio = requestedRatio ?? ratios[0] ?? 1;

    if (requestedRatio === null && ratios.some((ratio) => Math.abs(ratio - reductionRatio) > 0.0001)) {
      redirect(`${path}?error=${encodeURIComponent("Reduce every option by the same percentage when price protection is enabled.")}`);
    }

    const discountsResult = await admin
      .from("customer_product_discounts")
      .select("id, discount_percent")
      .eq("product_id", productId)
      .eq("is_active", true);
    if (discountsResult.error) redirect(`${path}?error=${encodeURIComponent(discountsResult.error.message)}`);

    adjustedDiscounts = (discountsResult.data ?? []).map((discount) => {
      const currentDiscount = Number(discount.discount_percent);
      const nextDiscount = 100 - (100 - currentDiscount) / reductionRatio;

      if (nextDiscount < -0.005) {
        redirect(`${path}?error=${encodeURIComponent("The new regular price is below at least one customer's current price. Use a smaller reduction.")}`);
      }

      return {
        id: discount.id,
        discountPercent: nextDiscount <= 0.005 ? null : Math.round(nextDiscount * 100) / 100,
      };
    });
  }

  const removedIds = (existingResult.data ?? []).map((option) => option.id).filter((id) => !submittedIds.includes(id));
  if (removedIds.length > 0) {
    const deactivateResult = await admin.from("product_options").update({ is_active: false }).in("id", removedIds).eq("product_id", productId);
    if (deactivateResult.error) redirect(`${path}?error=${encodeURIComponent(deactivateResult.error.message)}`);
  }

  for (const [index, option] of options.entries()) {
    const values = { category_id: product.data.category_id, option_type: "CURRENCY", option_name: option.name.trim(), denomination: option.denomination, denomination_currency: option.currency, selling_price: option.sellingPrice, sort_order: index, is_active: option.isActive, is_in_stock: option.isInStock !== false, is_custom_value: false, ...(isUnlimitedStock(product.data.stock_quantity) ? { stock_quantity: UNLIMITED_STOCK_QUANTITY } : {}) };
    const result = option.id
      ? await admin.from("product_options").update(values).eq("id", option.id).eq("product_id", productId)
      : await admin.from("product_options").insert({ ...values, product_id: productId, stock_quantity: isUnlimitedStock(product.data.stock_quantity) ? UNLIMITED_STOCK_QUANTITY : 0 });
    if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  }

  for (const discount of adjustedDiscounts) {
    const result = discount.discountPercent === null
      ? await admin.from("customer_product_discounts").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", discount.id)
      : await admin.from("customer_product_discounts").update({ discount_percent: discount.discountPercent, updated_at: new Date().toISOString() }).eq("id", discount.id);
    if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  }

  revalidatePath(path); revalidatePath(`/admin/products/${productId}/edit/stock`); revalidatePath("/");
  const successMessage = preserveDiscountedPrices
    ? `Product options saved. ${adjustedDiscounts.length} customer discounts adjusted.`
    : "Product options saved.";
  redirect(`${path}?success=${encodeURIComponent(successMessage)}`);
}
