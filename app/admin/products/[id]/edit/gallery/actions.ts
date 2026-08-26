"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadStoreImage } from "@/lib/store-image-upload";

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
  revalidatePath(path);
  revalidatePath("/");
  redirect(`${path}?success=${encodeURIComponent("Product gallery saved.")}`);
}
