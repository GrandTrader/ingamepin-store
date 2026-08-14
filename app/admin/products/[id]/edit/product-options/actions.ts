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
  const existingResult = await admin.from("product_options").select("id").eq("product_id", productId).eq("is_custom_value", false);
  if (existingResult.error) redirect(`${path}?error=${encodeURIComponent(existingResult.error.message)}`);
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
  revalidatePath(path); revalidatePath(`/admin/products/${productId}/edit/stock`); revalidatePath("/");
  redirect(`${path}?success=${encodeURIComponent("Product options saved.")}`);
}
