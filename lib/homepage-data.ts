import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

const getCachedHomepageData = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const [
      categoryResult,
      productResult,
      preorderPopupResult,
      sliderSettingsResult,
      slidesResult,
    ] = await Promise.all([
      supabase
        .from("categories")
        .select("id, public_id, name, short_name, slug, description, image_url, icon")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select(`
          id,
          public_id,
          name,
          name_ru,
          slug,
          image_url,
          image_url_ru,
          price,
          badge,
          badge_ru,
          region,
          stock_quantity,
          rating,
          sold_count,
          product_type,
          is_featured,
          is_bulk_order,
          delivery_type,
          product_options (stock_quantity, is_active, is_in_stock),
          categories (short_name, slug, public_id)
        `)
        .eq("status", "ACTIVE")
        .eq("is_preorder_only", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("preorder_popup_settings")
        .select("is_enabled, product_id, game_title, image_url, launch_date, preorder_price, sold_count, bonus_text, button_text")
        .eq("id", true)
        .eq("is_enabled", true)
        .maybeSingle(),
      supabase
        .from("homepage_slider_settings")
        .select("is_enabled, autoplay_ms")
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("homepage_slides")
        .select("id, eyebrow, title, description, desktop_image_url, mobile_image_url, button_text, button_url, starts_at, ends_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    const error =
      categoryResult.error ??
      productResult.error ??
      preorderPopupResult.error ??
      sliderSettingsResult.error ??
      slidesResult.error;

    if (error) {
      throw new Error(`Unable to load homepage data: ${error.message}`);
    }

    return {
      categories: categoryResult.data ?? [],
      products: productResult.data ?? [],
      preorderPopup: preorderPopupResult.data,
      sliderSettings: sliderSettingsResult.data,
      slides: slidesResult.data ?? [],
    };
  },
  ["homepage-store-data-v1"],
  { revalidate: 30, tags: ["homepage-store-data"] },
);

export async function getHomepageData() {
  return getCachedHomepageData();
}
