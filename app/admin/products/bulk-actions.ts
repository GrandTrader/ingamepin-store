"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";

export type BulkActivationResult = {
  activated: string[];
  alreadyActive: number;
  skipped: { id: string; name: string; reason: string }[];
  error?: string;
};

export async function activateSelectedProducts(form: FormData): Promise<BulkActivationResult> {
  const empty = { activated: [], alreadyActive: 0, skipped: [] };
  // The session helper verifies both the login and administrator MFA.
  const session = await createClient({ reuseVerifiedUser: true });
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return { ...empty, error: "Sign in as an administrator." };
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) return { ...empty, error: "Administrator access required." };

  const submitted = form.getAll("product_ids");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!submitted.length || submitted.length > 20 || submitted.some(value => typeof value !== "string" || !uuid.test(value))) {
    return { ...empty, error: "Select between 1 and 20 products on this page." };
  }
  const ids = [...new Set(submitted.map(value => String(value).toLowerCase()))];
  const admin = createAdminClient();
  const products = await admin.from("products")
    .select("id,name,slug,category_id,status,updated_at,product_options(is_active,selling_price)")
    .in("id", ids);
  if (products.error) return { ...empty, error: "Unable to check the selected products. Please try again." };
  if (!products.data || products.data.length !== ids.length) return { ...empty, error: "A selected product no longer exists. Refresh the product list." };

  const result: BulkActivationResult = { activated: [], alreadyActive: 0, skipped: [] };
  for (const product of products.data) {
    const skip = (reason: string) => result.skipped.push({ id: product.id, name: product.name || "Untitled product", reason });
    if (product.status === "ACTIVE") { result.alreadyActive++; continue; }
    if (!["DRAFT", "INACTIVE"].includes(product.status)) { skip("Refresh this product’s status before activating it."); continue; }
    if (!product.name?.trim() || product.name === "New Product Draft" || !product.slug?.trim() || !product.category_id) {
      skip("Add a product name and category first."); continue;
    }
    if (!product.product_options?.some(option => option.is_active && Number.isFinite(Number(option.selling_price)) && Number(option.selling_price) > 0)) {
      skip("Add an active product option with a price greater than zero."); continue;
    }
    try {
      // Compare before saving so an intervening edit or suspension is preserved.
      let update = admin.from("products").update({ status: "ACTIVE", updated_at: new Date().toISOString() })
        .eq("id", product.id).eq("status", product.status);
      update = product.updated_at ? update.eq("updated_at", product.updated_at) : update.is("updated_at", null);
      const saved = await update.select("id").maybeSingle();
      if (saved.error) skip("Could not save. Review this product and try again.");
      else if (!saved.data) skip("This product changed. Refresh and review it before trying again.");
      else result.activated.push(product.id);
    } catch { skip("Could not confirm activation. Refresh to check this product’s status."); }
  }
  if (result.activated.length) {
    updateTag("homepage-store-data");
    updateTag("business-catalogue");
    revalidatePath("/", "layout");
  }
  return result;
}
