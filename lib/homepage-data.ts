import { getStoreCategories } from "@/lib/store-catalogue";
import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

const getCachedHomepageData = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const [
      categoryResult,
      preorderPopupResult,
      sliderSettingsResult,
      slidesResult,
    ] = await Promise.all([
      getStoreCategories().then(data => ({ data, error: null })),
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
      preorderPopupResult.error ??
      sliderSettingsResult.error ??
      slidesResult.error;

    if (error) {
      throw new Error(`Unable to load homepage data: ${error.message}`);
    }

    return {
      categories: categoryResult.data ?? [],
      preorderPopup: preorderPopupResult.data,
      sliderSettings: sliderSettingsResult.data,
      slides: slidesResult.data ?? [],
    };
  },
  ["homepage-presentation-v5"],
  { revalidate: 30, tags: ["homepage-store-data"] },
);

export async function getHomepageData() {
  return getCachedHomepageData();
}
