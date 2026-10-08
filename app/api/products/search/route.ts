import {
  NextRequest,
  NextResponse,
} from "next/server";

import { matchesStorefrontProduct, storefrontSearchQuery } from "@/lib/storefront-search";
import { productSearchPages } from "@/lib/product-search-pages";
import { createClient } from "@/lib/supabase/server";
import { getProductUrl } from "@/lib/product-url";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const query = storefrontSearchQuery(request.nextUrl.searchParams.get("q"));

  if (query.length < 2) {
    return NextResponse.json(
      {
        products: [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const supabase = await createClient();
  const result = await productSearchPages((from, to) => supabase
    .from("products")
    .select(
      `
        id,
        public_id,
        name,
        name_ru,
        slug,
        image_url,
        image_url_ru,
        price,
        badge,
        is_bulk_order,
        region,
        product_options (option_name, platform, is_active),
        categories (
          name,
          short_name,
          slug,
          public_id
        )
      `,
    )
    .eq("status", "ACTIVE").eq("retail_enabled", true)
    .eq("is_preorder_only", false)
    .order("is_featured", {
      ascending: false,
    })
    .order("sort_order", {
      ascending: true,
    })
    .order("id", { ascending: true }).range(from, to));

  if (result.error) {
    return NextResponse.json(
      {
        error:
          "Unable to search products.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const products = (result.data ?? []).filter(product => matchesStorefrontProduct(product, query)).slice(0, 6).map(
    (product) => {
      const category = Array.isArray(
        product.categories,
      )
        ? product.categories[0]
        : product.categories;

      return {
        id: product.id,
        name: product.name,
        nameRu: product.name_ru,
        slug: product.slug,
        href: category
          ? getProductUrl({
              categorySlug: category.slug,
              categoryPublicId: category.public_id,
              productPublicId: product.public_id,
            })
          : `/product/${encodeURIComponent(product.slug)}`,
        image: product.image_url,
        imageRu: product.image_url_ru,
        price: Number(product.price),
        badge: product.badge,
        isBulkOrder: product.is_bulk_order,
        category:
          category?.short_name ??
          "Digital Product",
      };
    },
  );

  return NextResponse.json(
    {
      products,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
