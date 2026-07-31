"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadStoreImage } from "@/lib/store-image-upload";

export async function updateProductGeneral(formData: FormData) {
  const productId = String(formData.get("id") ?? "").trim();
  const path = `/admin/products/${productId}/edit/general`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");

  const name = String(formData.get("name") ?? "").trim();
  const nameRu = String(formData.get("name_ru") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const descriptionRu = String(formData.get("description_ru") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  let imageUrl = String(formData.get("image_url") ?? "").trim();

  if (!productId || name.length < 2 || !categoryId || !region) {
    redirect(`${path}?error=${encodeURIComponent("Product name, category and region are required.")}`);
  }

  const categoryResult = await supabase.from("categories").select("category_type").eq("id", categoryId).eq("is_active", true).maybeSingle();
  if (!categoryResult.data) redirect(`${path}?error=${encodeURIComponent("Select a valid category.")}`);

  try {
    imageUrl = (await uploadStoreImage(formData.get("image_file"), "products")) ?? imageUrl;
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload product image.")}`);
  }

  const admin = createAdminClient();
  const result = await admin
    .from("products")
    .update({
      name,
      name_ru: nameRu || null,
      description: description || null,
      description_ru: descriptionRu || null,
      category_id: categoryId,
      product_type: categoryResult.data.category_type,
      region,
      image_url: imageUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (result.error) {
    redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  }

  revalidatePath(path);
  revalidatePath(`/product/${productId}`);
  redirect(`${path}?success=${encodeURIComponent("General information saved.")}`);
}
