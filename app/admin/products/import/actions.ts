"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFullProductCsv, resolveImportCategory } from "@/lib/full-product-import";
import { UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";

export type ImportProductResult = { error?: string; productId?: string };

export async function importFullProduct(csv: string, selectedCategoryId: string): Promise<ImportProductResult> {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: "Sign in as an administrator to import products." };
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) return { error: "Administrator access is required." };

  let product;
  try { product = parseFullProductCsv(csv); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid CSV file." }; }

  const categories = await session.from("categories").select("id, name, slug, category_type").eq("is_active", true);
  if (categories.error) return { error: "Unable to check categories. Please try again." };
  let category;
  try { category = resolveImportCategory(product, categories.data ?? [], selectedCategoryId); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid category." }; }

  const admin = createAdminClient();
  let productId: string | undefined;
  try {
    const inStock = product.options.filter(option => option.isInStock);
    const stockQuantity = inStock.some(option => option.stockQuantity === UNLIMITED_STOCK_QUANTITY)
      ? UNLIMITED_STOCK_QUANTITY : inStock.reduce((sum, option) => sum + option.stockQuantity, 0);
    const result = await admin.from("products").insert({
      category_id: category.id, name: product.titleEn, name_ru: product.titleRu || null,
      description: product.descriptionEn || null, description_ru: product.descriptionRu || null,
      slug: product.slug, region: product.region, product_type: category.category_type,
      delivery_type: product.deliveryType, is_bulk_order: product.isBulkOrder,
      bulk_delivery_instructions: product.isBulkOrder ? product.bulkDeliveryInstructions : null,
      currency: "USD", price: Math.min(...product.options.map(option => option.price)),
      stock_quantity: stockQuantity, status: "DRAFT", is_featured: false,
      allows_fixed_values: true, allows_custom_value: false,
      allows_player_id_topup: false, allows_gaming_voucher: true,
      minimum_quantity: 1, maximum_quantity: UNLIMITED_STOCK_QUANTITY, sold_count: 0,
    }).select("id").single();
    if (result.error || !result.data) {
      return { error: result.error?.code === "23505"
        ? "A product with this slug already exists. Open it from the product list, or use a different slug for a new product."
        : "Unable to create the draft. Check the product list before retrying." };
    }
    productId = result.data.id;
    const options = await admin.from("product_options").insert(product.options.map((option, index) => ({
      product_id: productId, category_id: category.id, option_type: "CURRENCY",
      option_name: option.name, denomination: option.denomination, denomination_currency: option.currency,
      selling_price: option.price, stock_quantity: option.stockQuantity,
      is_active: true, is_in_stock: option.isInStock, is_custom_value: false, sort_order: index,
    })));
    if (options.error) throw new Error("Unable to save the denominations.");
  } catch {
    if (productId) {
      try {
        const cleanup = await admin.from("products").delete().eq("id", productId).eq("status", "DRAFT");
        if (cleanup.error) throw cleanup.error;
      } catch {
        return { error: `The draft ${productId} was created, but its denominations could not be confirmed. Review it in the product list before retrying.` };
      }
    }
    return { error: "Import could not be completed. Check the product list before retrying." };
  }
  revalidatePath("/admin/products");
  return { productId };
}

