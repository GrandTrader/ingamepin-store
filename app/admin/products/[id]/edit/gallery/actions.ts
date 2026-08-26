"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadStoreImage } from "@/lib/store-image-upload";
import { uploadDigiSellerProductImage } from "@/lib/digiseller-api";

function isValidWebUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function saveProductGallery(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/gallery`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  let imageUrl = String(formData.get("image_url") ?? "").trim();
  if (!isValidWebUrl(imageUrl)) redirect(`${path}?error=${encodeURIComponent("Enter a valid HTTP or HTTPS product image URL.")}`);
  try {
    imageUrl = (await uploadStoreImage(formData.get("image_file"), "products")) ?? imageUrl;
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload product image.")}`);
  }

  const result = await createAdminClient().from("products").update({ image_url: imageUrl || null, updated_at: new Date().toISOString() }).eq("id", productId);
  if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  let syncedCount = 0;
  if (imageUrl) {
    const mappings = await createAdminClient().from("product_options").select("digiseller_product_id").eq("product_id", productId).not("digiseller_product_id", "is", null);
    if (mappings.error) redirect(`${path}?error=${encodeURIComponent(mappings.error.message)}`);
    const productIds = [...new Set((mappings.data ?? []).map((row) => Number(row.digiseller_product_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    try {
      for (const digisellerProductId of productIds) await uploadDigiSellerProductImage(digisellerProductId, imageUrl);
      syncedCount = productIds.length;
    } catch (error) {
      redirect(`${path}?error=${encodeURIComponent(`Gallery saved, but DigiSeller sync failed: ${error instanceof Error ? error.message : "Upload failed"}`)}`);
    }
  }
  revalidatePath(path);
  revalidatePath("/");
  redirect(`${path}?success=${encodeURIComponent(syncedCount ? "Product gallery saved and DigiSeller image synchronized." : "Product gallery saved.")}`);
}

export async function syncProductGalleryToDigiSeller(productId: string) {
  const path = `/admin/products/${productId}/edit/gallery`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
  const admin = createAdminClient();
  const [product, mappings] = await Promise.all([
    admin.from("products").select("image_url").eq("id", productId).single(),
    admin.from("product_options").select("digiseller_product_id").eq("product_id", productId).not("digiseller_product_id", "is", null),
  ]);
  if (product.error || !product.data?.image_url) redirect(`${path}?error=${encodeURIComponent("Save a main product image first.")}`);
  if (mappings.error) redirect(`${path}?error=${encodeURIComponent(mappings.error.message)}`);
  const productIds = [...new Set((mappings.data ?? []).map((row) => Number(row.digiseller_product_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!productIds.length) redirect(`${path}?error=${encodeURIComponent("Connect this product to DigiSeller in the Stock tab first.")}`);
  try {
    await Promise.all(productIds.map((digisellerProductId) => uploadDigiSellerProductImage(digisellerProductId, product.data.image_url)));
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to sync the image to DigiSeller.")}`);
  }
  redirect(`${path}?success=${encodeURIComponent(`Image synced to ${productIds.length} DigiSeller product${productIds.length === 1 ? "" : "s"}.`)}`);
}
