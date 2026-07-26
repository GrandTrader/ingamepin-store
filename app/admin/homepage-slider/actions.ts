"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadStoreImage } from "@/lib/store-image-upload";

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const result = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!result.data) redirect("/admin/login?error=Access denied");
}

function sliderRedirect(
  kind: "error" | "success",
  message: string,
): never {
  redirect(
    `/admin/homepage-slider?${kind}=${encodeURIComponent(message)}`,
  );
}

function optionalDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const date = new Date(`${text}:00+05:30`);
  if (Number.isNaN(date.getTime())) {
    sliderRedirect("error", "Enter valid start and end dates.");
  }

  return date.toISOString();
}

function validWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function saveSliderSettings(formData: FormData) {
  await requireAdministrator();

  const seconds = Number(formData.get("autoplay_seconds") ?? 5);
  if (!Number.isInteger(seconds) || seconds < 2 || seconds > 30) {
    sliderRedirect("error", "Autoplay must be between 2 and 30 seconds.");
  }

  const result = await createAdminClient()
    .from("homepage_slider_settings")
    .upsert({
      id: true,
      is_enabled: formData.get("is_enabled") === "on",
      autoplay_ms: seconds * 1000,
    });

  if (result.error) sliderRedirect("error", result.error.message);

  revalidatePath("/");
  revalidatePath("/admin/homepage-slider");
  sliderRedirect("success", "Slider settings saved.");
}

export async function saveSlide(formData: FormData) {
  await requireAdministrator();

  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim() || null;
  let desktopImageUrl = String(
    formData.get("desktop_image_url") ?? "",
  ).trim();
  let buttonUrl = String(formData.get("button_url") ?? "").trim();
  let internalTitle = "Homepage promotion";

  try {
    desktopImageUrl =
      (await uploadStoreImage(
        formData.get("desktop_image_file"),
        "slides",
      )) ?? desktopImageUrl;
  } catch (error) {
    sliderRedirect(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to upload slide image.",
    );
  }

  if (!desktopImageUrl) {
    sliderRedirect("error", "Desktop slide image is required.");
  }

  if (!validWebUrl(desktopImageUrl)) {
    sliderRedirect("error", "Enter a valid desktop image URL.");
  }

  if (productId) {
    const product = await admin
      .from("products")
      .select("name, slug, is_preorder_only")
      .eq("id", productId)
      .maybeSingle();

    if (product.error || !product.data) {
      sliderRedirect("error", "The selected product could not be found.");
    }

    internalTitle = product.data.name;
    buttonUrl = product.data.is_preorder_only
      ? "/preorder"
      : `/product/${product.data.slug}`;
  }

  if (!buttonUrl || (!buttonUrl.startsWith("/") && !validWebUrl(buttonUrl))) {
    sliderRedirect(
      "error",
      "Select a product or enter a valid Buy Now link.",
    );
  }

  const startsAt = optionalDate(formData.get("starts_at"));
  const endsAt = optionalDate(formData.get("ends_at"));

  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    sliderRedirect("error", "End date must be after the start date.");
  }

  const values = {
    product_id: productId,
    eyebrow: "",
    title: internalTitle,
    description: "",
    desktop_image_url: desktopImageUrl,
    mobile_image_url: null,
    button_text: "Buy Now",
    button_url: buttonUrl,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: formData.get("is_active") === "on",
  };

  if (id) {
    const result = await admin
      .from("homepage_slides")
      .update(values)
      .eq("id", id);

    if (result.error) sliderRedirect("error", result.error.message);
  } else {
    const last = await admin
      .from("homepage_slides")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last.error) sliderRedirect("error", last.error.message);

    const result = await admin.from("homepage_slides").insert({
      ...values,
      sort_order: Number(last.data?.sort_order ?? -1) + 1,
    });

    if (result.error) sliderRedirect("error", result.error.message);
  }

  revalidatePath("/");
  revalidatePath("/admin/homepage-slider");
  sliderRedirect("success", id ? "Slide updated." : "Slide created.");
}

export async function deleteSlide(formData: FormData) {
  await requireAdministrator();

  const result = await createAdminClient()
    .from("homepage_slides")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));

  if (result.error) sliderRedirect("error", result.error.message);

  revalidatePath("/");
  revalidatePath("/admin/homepage-slider");
  sliderRedirect("success", "Slide deleted.");
}

export async function moveSlide(formData: FormData) {
  await requireAdministrator();

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const admin = createAdminClient();

  const result = await admin
    .from("homepage_slides")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (result.error) sliderRedirect("error", result.error.message);

  const slides = result.data ?? [];
  const index = slides.findIndex((slide) => slide.id === id);
  const otherIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || otherIndex < 0 || otherIndex >= slides.length) {
    sliderRedirect("error", "This slide cannot move further.");
  }

  const current = slides[index];
  const other = slides[otherIndex];

  const first = await admin
    .from("homepage_slides")
    .update({ sort_order: other.sort_order })
    .eq("id", current.id);

  const second = await admin
    .from("homepage_slides")
    .update({ sort_order: current.sort_order })
    .eq("id", other.id);

  if (first.error || second.error) {
    sliderRedirect(
      "error",
      first.error?.message ?? second.error!.message,
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/homepage-slider");
  sliderRedirect("success", "Slide order updated.");
}
