import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const query = String(
    request.nextUrl.searchParams.get("q") ?? "",
  )
    .trim()
    .replaceAll("%", "")
    .replaceAll("_", "")
    .slice(0, 80);

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
  const result = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        slug,
        image_url,
        price,
        badge,
        categories (
          short_name
        )
      `,
    )
    .eq("status", "ACTIVE")
    .ilike("name", `%${query}%`)
    .order("is_featured", {
      ascending: false,
    })
    .order("sort_order", {
      ascending: true,
    })
    .limit(6);

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

  const products = (result.data ?? []).map(
    (product) => {
      const category = Array.isArray(
        product.categories,
      )
        ? product.categories[0]
        : product.categories;

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.image_url,
        price: Number(product.price),
        badge: product.badge,
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
