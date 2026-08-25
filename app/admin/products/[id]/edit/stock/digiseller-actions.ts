"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createDigiSellerFormProduct, listDigiSellerVariants, parseDigiSellerCategoryUrl } from "@/lib/digiseller-api";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
}

export async function saveDigiSellerMapping(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/stock`;
  await requireAdmin();

  const admin = createAdminClient();
  const options = await admin.from("product_options").select("id, option_name, denomination").eq("product_id", productId).eq("is_custom_value", false);
  if (options.error) redirect(`${path}?error=${encodeURIComponent(options.error.message)}`);

  const variantsByProduct = new Map<number, Awaited<ReturnType<typeof listDigiSellerVariants>>>();

  for (const option of options.data ?? []) {
    const raw = String(formData.get(`digiseller_${option.id}`) ?? "").trim();
    const variantRaw = String(formData.get(`digiseller_variant_${option.id}`) ?? "").trim();
    const digisellerProductId = raw ? Number(raw) : null;
    if (digisellerProductId !== null && (!Number.isSafeInteger(digisellerProductId) || digisellerProductId <= 0)) {
      redirect(`${path}?error=${encodeURIComponent("Invalid DigiSeller product selected.")}`);
    }
    let [optionPart, variantPart] = variantRaw ? variantRaw.split(":") : [];
    if (digisellerProductId && !variantRaw) {
      let variants = variantsByProduct.get(digisellerProductId);
      if (!variants) {
        try {
          variants = await listDigiSellerVariants(digisellerProductId);
          variantsByProduct.set(digisellerProductId, variants);
        } catch (error) {
          redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to load DigiSeller denominations.")}`);
        }
      }
      const denomination = Number(option.denomination);
      const numberPattern = new RegExp(`(^|\\D)${denomination}(\\D|$)`);
      const match = variants.find((variant) => Number.isFinite(denomination) && numberPattern.test(variant.name));
      if (match) {
        optionPart = String(match.optionId);
        variantPart = String(match.variantId);
      } else if (variants.length > 0) {
        redirect(`${path}?error=${encodeURIComponent(`Choose a DigiSeller denomination for ${option.option_name}.`)}`);
      }
    }
    const digisellerOptionId = optionPart ? Number(optionPart) : null;
    const digisellerVariantId = variantPart ? Number(variantPart) : null;
    if (digisellerProductId !== null && variantRaw && (!Number.isSafeInteger(digisellerOptionId) || !Number.isSafeInteger(digisellerVariantId))) redirect(`${path}?error=${encodeURIComponent("Invalid DigiSeller denomination selected.")}`);
    const update = await admin.from("product_options").update({ digiseller_product_id: digisellerProductId, digiseller_option_id: digisellerProductId ? digisellerOptionId : null, digiseller_variant_id: digisellerProductId ? digisellerVariantId : null, updated_at: new Date().toISOString() }).eq("id", option.id).eq("product_id", productId);
    if (update.error) redirect(`${path}?error=${encodeURIComponent(update.error.message)}`);
  }
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent("DigiSeller product matches saved.")}`);
}

export async function createDigiSellerProduct(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/stock`;
  await requireAdmin();
  let createdProductId: number;
  try {
    const category = parseDigiSellerCategoryUrl(String(formData.get("category_url") ?? "").trim());
    const admin = createAdminClient();
    const [productResult, optionsResult] = await Promise.all([
      admin.from("products").select("name, name_ru, description, description_ru").eq("id", productId).single(),
      admin.from("product_options").select("id, option_name, selling_price").eq("product_id", productId).eq("is_active", true).eq("is_custom_value", false).order("sort_order"),
    ]);
    if (productResult.error) throw new Error(productResult.error.message);
    if (optionsResult.error) throw new Error(optionsResult.error.message);
    const options = (optionsResult.data ?? []).map((option) => ({ ...option, price: Number(option.selling_price) })).filter((option) => Number.isFinite(option.price) && option.price > 0);
    if (!options.length) throw new Error("Add at least one active denomination with a selling price first.");
    const basePrice = Math.min(...options.map((option) => option.price));
    const created = await createDigiSellerFormProduct({
      name: productResult.data.name,
      nameRu: productResult.data.name_ru,
      description: productResult.data.description || productResult.data.name,
      descriptionRu: productResult.data.description_ru,
      basePrice,
      category,
      variants: options.map((option) => ({ name: option.option_name, price: option.price })),
    });
    for (const option of options) {
      const denomination = Number.parseFloat(option.option_name);
      const match = created.variants.find((variant) => Number.isFinite(denomination) && new RegExp(`(^|\\D)${denomination}(\\D|$)`).test(variant.name));
      const update = await admin.from("product_options").update({
        digiseller_product_id: created.productId,
        digiseller_option_id: match?.optionId ?? null,
        digiseller_variant_id: match?.variantId ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", option.id).eq("product_id", productId);
      if (update.error) throw new Error(update.error.message);
    }
    createdProductId = created.productId;
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create DigiSeller product.")}`);
  }
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent(`Hidden DigiSeller product ${createdProductId} created and connected.`)}`);
}
