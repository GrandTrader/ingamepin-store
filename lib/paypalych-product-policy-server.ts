import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { paypalychBlockedBrand } from "./paypalych-product-policy";

export async function getPaypalychRestrictions(admin: ReturnType<typeof createAdminClient>, productIds: string[]) {
  const ids = [...new Set(productIds)];
  if (!ids.length || ids.length > 100) throw new Error("Unable to check product payment restrictions.");
  const result = await admin.from("products")
    .select("id,name,name_ru,slug,categories(name,slug),product_options(option_name)").in("id", ids);
  if (result.error || result.data?.length !== ids.length) throw new Error("Unable to check product payment restrictions.");
  return new Map(result.data.map(product => {
    const categories = Array.isArray(product.categories) ? product.categories : [product.categories];
    return [product.id, paypalychBlockedBrand(product.name, product.name_ru, product.slug,
      ...categories.flatMap(category => category ? [category.name, category.slug] : []),
      ...(product.product_options ?? []).map(option => option.option_name))];
  }));
}

export const getProductPaypalychRestriction = cache(async (id: string) =>
  (await getPaypalychRestrictions(createAdminClient(), [id])).get(id) ?? null);
