"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function saveDigiSellerMapping(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/stock`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const options = await admin.from("product_options").select("id").eq("product_id", productId).eq("is_custom_value", false);
  if (options.error) redirect(`${path}?error=${encodeURIComponent(options.error.message)}`);

  for (const option of options.data ?? []) {
    const raw = String(formData.get(`digiseller_${option.id}`) ?? "").trim();
    const variantRaw = String(formData.get(`digiseller_variant_${option.id}`) ?? "").trim();
    const digisellerProductId = raw ? Number(raw) : null;
    if (digisellerProductId !== null && (!Number.isSafeInteger(digisellerProductId) || digisellerProductId <= 0)) {
      redirect(`${path}?error=${encodeURIComponent("Invalid DigiSeller product selected.")}`);
    }
    const [optionPart, variantPart] = variantRaw ? variantRaw.split(":") : [];
    const digisellerOptionId = optionPart ? Number(optionPart) : null;
    const digisellerVariantId = variantPart ? Number(variantPart) : null;
    if (digisellerProductId !== null && variantRaw && (!Number.isSafeInteger(digisellerOptionId) || !Number.isSafeInteger(digisellerVariantId))) redirect(`${path}?error=${encodeURIComponent("Invalid DigiSeller denomination selected.")}`);
    const update = await admin.from("product_options").update({ digiseller_product_id: digisellerProductId, digiseller_option_id: digisellerProductId ? digisellerOptionId : null, digiseller_variant_id: digisellerProductId ? digisellerVariantId : null, updated_at: new Date().toISOString() }).eq("id", option.id).eq("product_id", productId);
    if (update.error) redirect(`${path}?error=${encodeURIComponent(update.error.message)}`);
  }
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent("DigiSeller product matches saved.")}`);
}
