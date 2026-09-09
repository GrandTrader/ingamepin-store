import type { MetadataRoute } from "next";

import { getProductUrl } from "@/lib/product-url";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600;

const siteUrl = "https://www.ingamepin.com";
const pageSize = 500;

type Category = { slug: string; public_id: number | string };
type Product = {
  slug: string;
  public_id: number | string;
  categories: Category | Category[] | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();
  const entries: MetadataRoute.Sitemap = [
    "/", "/products", "/products/bulk", "/support", "/work-with-us",
    "/affiliate-program", "/terms", "/privacy-policy", "/refund-policy",
  ].map((path) => ({ url: `${siteUrl}${path}` }));

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("categories")
      .select("slug")
      .eq("is_active", true)
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Unable to load sitemap categories: ${error.message}`);
    for (const category of data ?? []) {
      entries.push({ url: `${siteUrl}/category/${encodeURIComponent(category.slug)}` });
    }
    if (!data || data.length < pageSize) break;
  }

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("slug, public_id, categories(slug, public_id)")
      .eq("status", "ACTIVE")
      .eq("is_preorder_only", false)
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Unable to load sitemap products: ${error.message}`);
    for (const product of (data ?? []) as Product[]) {
      const category = Array.isArray(product.categories)
        ? product.categories[0]
        : product.categories;
      const path = category
        ? getProductUrl({
            categorySlug: category.slug,
            categoryPublicId: category.public_id,
            productPublicId: product.public_id,
          })
        : `/product/${encodeURIComponent(product.slug)}`;
      entries.push({ url: `${siteUrl}${path}` });
    }
    if (!data || data.length < pageSize) break;
  }

  return Array.from(new Map(entries.map((entry) => [entry.url, entry])).values());
}
