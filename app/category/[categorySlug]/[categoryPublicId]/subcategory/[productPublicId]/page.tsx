import { notFound, permanentRedirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getProductUrl } from "@/lib/product-url";
import { renderProductPage } from "@/app/product/[slug]/page";

export const dynamic = "force-dynamic";

type CanonicalProductPageProps = {
  params: Promise<{
    categorySlug: string;
    categoryPublicId: string;
    productPublicId: string;
  }>;
  searchParams: Promise<{
    ref?: string | string[];
  }>;
};

type CategoryRelation =
  | {
      slug: string;
      public_id: number | string;
    }
  | {
      slug: string;
      public_id: number | string;
    }[]
  | null;

type ProductLookupRow = {
  slug: string;
  public_id: number | string;
  categories: CategoryRelation;
};

function firstCategory(category: CategoryRelation) {
  return Array.isArray(category) ? category[0] : category;
}

function validPublicId(value: string) {
  return /^\d{9}$/.test(value);
}

export default async function CanonicalProductPage({
  params,
  searchParams,
}: CanonicalProductPageProps) {
  const { categorySlug, categoryPublicId, productPublicId } = await params;

  if (!validPublicId(categoryPublicId) || !validPublicId(productPublicId)) {
    notFound();
  }

  const supabase = await createClient();
  const productResult = await supabase
    .from("products")
    .select(
      `
        slug,
        public_id,
        categories (
          slug,
          public_id
        )
      `,
    )
    .eq("public_id", productPublicId)
    .eq("status", "ACTIVE")
    .eq("is_preorder_only", false)
    .maybeSingle();

  if (productResult.error) {
    throw new Error(
      `Unable to load product: ${productResult.error.message}`,
    );
  }

  if (!productResult.data) {
    notFound();
  }

  const product = productResult.data as ProductLookupRow;
  const category = firstCategory(product.categories);

  if (!category) {
    notFound();
  }

  const canonicalUrl = getProductUrl({
    categorySlug: category.slug,
    categoryPublicId: category.public_id,
    productPublicId: product.public_id,
  });

  if (
    category.slug !== categorySlug ||
    String(category.public_id) !== categoryPublicId ||
    String(product.public_id) !== productPublicId
  ) {
    const query = await searchParams;
    const affiliateCode = Array.isArray(query.ref)
      ? query.ref[0]?.trim()
      : query.ref?.trim();
    const referral = affiliateCode
      ? `?ref=${encodeURIComponent(affiliateCode)}`
      : "";

    permanentRedirect(`${canonicalUrl}${referral}`);
  }

  return renderProductPage({
    slug: product.slug,
    searchParams,
    canonicalRequest: true,
  });
}
