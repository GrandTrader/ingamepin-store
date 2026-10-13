"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-session";
import { createDigiSellerFormProduct, listDigiSellerVariants, parseDigiSellerCategoryUrl } from "@/lib/digiseller-api";
import { getDigiSellerRecipientFields, syncDigiSellerRecipientFields } from "@/lib/digiseller-field-sync";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
}

export async function saveDigiSellerMapping(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/digiseller`;
  await requireAdmin();

  const admin = createAdminClient();
  try { await getDigiSellerRecipientFields(admin, productId); }
  catch (error) { redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Customer information could not be checked.")}`); }
  const options = await admin.from("product_options").select("id, option_name, denomination").eq("product_id", productId).eq("is_active", true).eq("is_custom_value", false);
  if (options.error) redirect(`${path}?error=${encodeURIComponent(options.error.message)}`);

  const variantsByProduct = new Map<number, Awaited<ReturnType<typeof listDigiSellerVariants>>>();
  const changes: { id: string; productId: number | null; optionId: number | null; variantId: number | null }[] = [];

  for (const option of options.data ?? []) {
    const raw = String(formData.get(`digiseller_${option.id}`) ?? "").trim();
    const variantRaw = String(formData.get(`digiseller_variant_${option.id}`) ?? "").trim();
    const digisellerProductId = raw ? Number(raw) : null;
    if (digisellerProductId !== null && (!Number.isSafeInteger(digisellerProductId) || digisellerProductId <= 0)) {
      redirect(`${path}?error=${encodeURIComponent("Invalid DigiSeller product selected.")}`);
    }
    let [optionPart, variantPart] = variantRaw ? variantRaw.split(":") : [];
    if (digisellerProductId) {
      let variants = variantsByProduct.get(digisellerProductId);
      if (!variants) {
        try {
          variants = await listDigiSellerVariants(digisellerProductId);
          variantsByProduct.set(digisellerProductId, variants);
        } catch (error) {
          redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to load DigiSeller denominations.")}`);
        }
      }
      if (variantRaw) {
        if (!variants.some(variant => variant.optionId === Number(optionPart) && variant.variantId === Number(variantPart))) {
          redirect(`${path}?error=${encodeURIComponent(`Choose a valid DigiSeller denomination for ${option.option_name}.`)}`);
        }
      } else {
        const exact = variants.filter(variant => variant.name.trim().toLowerCase() === option.option_name.trim().toLowerCase());
        const denomination = Number(option.denomination);
        const numberPattern = new RegExp(`(^|\\D)${denomination}(\\D|$)`);
        const uniqueValue = (options.data ?? []).filter(row => Number(row.denomination) === denomination).length === 1;
        const matches = exact.length ? exact : uniqueValue ? variants.filter(variant => Number.isFinite(denomination) && numberPattern.test(variant.name)) : [];
        if (matches.length === 1) {
          optionPart = String(matches[0].optionId);
          variantPart = String(matches[0].variantId);
        } else if (variants.length > 0) {
          redirect(`${path}?error=${encodeURIComponent(`Choose a DigiSeller denomination for ${option.option_name}.`)}`);
        }
      }
    }
    const digisellerOptionId = optionPart ? Number(optionPart) : null;
    const digisellerVariantId = variantPart ? Number(variantPart) : null;
    if (digisellerProductId !== null && variantRaw && (!Number.isSafeInteger(digisellerOptionId) || !Number.isSafeInteger(digisellerVariantId))) redirect(`${path}?error=${encodeURIComponent("Invalid DigiSeller denomination selected.")}`);
    if (digisellerProductId && changes.some(change => change.productId === digisellerProductId && change.optionId === digisellerOptionId && change.variantId === digisellerVariantId)) {
      redirect(`${path}?error=${encodeURIComponent("Each website option must match a different DigiSeller denomination.")}`);
    }
    changes.push({ id: option.id, productId: digisellerProductId, optionId: digisellerOptionId, variantId: digisellerVariantId });
  }
  for (const change of changes) {
    const update = await admin.from("product_options").update({ digiseller_product_id: change.productId, digiseller_option_id: change.productId ? change.optionId : null, digiseller_variant_id: change.productId ? change.variantId : null, updated_at: new Date().toISOString() }).eq("id", change.id).eq("product_id", productId);
    if (update.error) redirect(`${path}?error=${encodeURIComponent(update.error.message)}`);
  }
  try { if (changes.some(change => change.productId !== null)) await syncDigiSellerRecipientFields(admin, productId); }
  catch (error) { redirect(`${path}?error=${encodeURIComponent(`Product matches saved. ${error instanceof Error ? error.message : "Customer fields could not be synced."}`)}`); }
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent("DigiSeller product matches saved.")}`);
}

export async function createDigiSellerProduct(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/digiseller`;
  await requireAdmin();
  let createdProductId: number | null = null;
  try {
    const category = parseDigiSellerCategoryUrl(String(formData.get("category_url") ?? "").trim());
    const admin = createAdminClient();
    await getDigiSellerRecipientFields(admin, productId);
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
    createdProductId = created.productId;
    for (const option of options) {
      const matches = created.variants.filter(variant => variant.name.trim() === option.option_name.trim());
      if (matches.length !== 1) throw new Error(`DigiSeller product ${created.productId} was created. Match its denominations before syncing customer fields.`);
      const match = matches[0];
      const update = await admin.from("product_options").update({
        digiseller_product_id: created.productId,
        digiseller_option_id: match?.optionId ?? null,
        digiseller_variant_id: match?.variantId ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", option.id).eq("product_id", productId);
      if (update.error) throw new Error(update.error.message);
    }
    await syncDigiSellerRecipientFields(admin, productId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create DigiSeller product.";
    redirect(`${path}?error=${encodeURIComponent(createdProductId ? `DigiSeller product ${createdProductId} was created. ${message} Use its existing product match and sync again.` : message)}`);
  }
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent(`Hidden DigiSeller product ${createdProductId} created and connected.`)}`);
}

export async function syncDigiSellerCustomerFields(productId: string) {
  await requireAdmin();
  const path = `/admin/products/${productId}/edit/digiseller`;
  try { await syncDigiSellerRecipientFields(createAdminClient(), productId); }
  catch (error) { redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Customer fields could not be synced.")}`); }
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent("Customer fields and FKWallet delivery connected to DigiSeller.")}`);
}
