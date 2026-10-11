import {
  NextRequest,
  NextResponse,
} from "next/server";

import { matchesStorefrontProduct, storefrontSearchQuery } from "@/lib/storefront-search";
import { cardPromotionPrice } from "@/lib/product-promotions";
import { getStoreProducts, getStoreOffers } from "@/lib/store-catalogue";
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

  const result = await getStoreProducts().then(data => ({ data, error: null }))
    .catch(() => ({ data: [], error: "Unable to load store products." }));

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

  const matched=(result.data??[]).filter(product=>matchesStorefrontProduct(product,query)).slice(0,6);
  const promotions=await getStoreOffers();
  const products = matched.map(
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
        price: cardPromotionPrice(promotions.get(product.id),Number(product.price)).price,
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
