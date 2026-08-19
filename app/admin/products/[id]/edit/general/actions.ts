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
  let imageUrlRu = String(formData.get("image_url_ru") ?? "").trim();
  let popupImageUrl = String(formData.get("popup_image_url") ?? "").trim();
  const useAsPopup = formData.get("use_as_popup") === "on";
  const wasPopupProduct = formData.get("was_popup_product") === "true";
  const reviewRewardEnabled = formData.get("review_reward_enabled") === "on";
  const reviewRewardPercent = Number(formData.get("review_reward_percent") ?? 0);

  if (!productId || name.length < 2 || !categoryId || !region) {
    redirect(`${path}?error=${encodeURIComponent("Product name, category and region are required.")}`);
  }

  if (!isValidWebUrl(imageUrl) || !isValidWebUrl(imageUrlRu)) {
    redirect(`${path}?error=${encodeURIComponent("Enter valid HTTP or HTTPS product image URLs.")}`);
  }

  const categoryResult = await supabase.from("categories").select("category_type").eq("id", categoryId).eq("is_active", true).maybeSingle();
  if (!categoryResult.data) redirect(`${path}?error=${encodeURIComponent("Select a valid category.")}`);

  if (
    !Number.isFinite(reviewRewardPercent) ||
    reviewRewardPercent < 0 ||
    reviewRewardPercent > 100
  ) {
    redirect(`${path}?error=${encodeURIComponent("Positive feedback bonus must be between 0% and 100%.")}`);
  }

  if (reviewRewardEnabled && reviewRewardPercent <= 0) {
    redirect(`${path}?error=${encodeURIComponent("Enter a positive feedback bonus greater than 0% before enabling it.")}`);
  }

  try {
    imageUrl = (await uploadStoreImage(formData.get("image_file"), "products")) ?? imageUrl;
    imageUrlRu =
      (await uploadStoreImage(formData.get("image_file_ru"), "products")) ??
      imageUrlRu;
    popupImageUrl = (await uploadStoreImage(formData.get("popup_image_file"), "popups")) ?? popupImageUrl;
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
      image_url_ru: imageUrlRu || null,
      review_reward_enabled: reviewRewardEnabled,
      review_reward_percent: reviewRewardEnabled ? reviewRewardPercent : 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (result.error) {
    redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  }

  if (useAsPopup) {
    if (!popupImageUrl) {
      redirect(`${path}?error=${encodeURIComponent("Add a popup image before enabling this product as the popup.")}`);
    }

    const productResult = await admin
      .from("products")
      .select("slug, price, currency, badge")
      .eq("id", productId)
      .maybeSingle();

    if (!productResult.data) {
      redirect(`${path}?error=${encodeURIComponent("Unable to load the saved product for the popup.")}`);
    }

    const popupResult = await admin
      .from("preorder_popup_settings")
      .upsert({
        id: true,
        product_id: productId,
        is_enabled: true,
        game_title: name,
        description: description || name,
        image_url: popupImageUrl,
        launch_date: null,
        preorder_price: Number(productResult.data.price),
        bonus_text: productResult.data.badge || "Available now",
        button_text: "VIEW PRODUCT",
        updated_at: new Date().toISOString(),
      });

    if (popupResult.error) {
      redirect(`${path}?error=${encodeURIComponent(`Product saved, but popup could not be enabled: ${popupResult.error.message}`)}`);
    }
  } else if (wasPopupProduct) {
    const popupResult = await admin
      .from("preorder_popup_settings")
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", true)
      .eq("product_id", productId);

    if (popupResult.error) {
      redirect(`${path}?error=${encodeURIComponent(`Product saved, but popup could not be disabled: ${popupResult.error.message}`)}`);
    }
  }

  revalidatePath(path);
  revalidatePath("/");
  revalidatePath(`/product/${productId}`);
  redirect(`${path}?success=${encodeURIComponent("General information saved.")}`);
}
