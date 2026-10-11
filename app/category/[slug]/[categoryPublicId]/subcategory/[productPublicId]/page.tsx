import { notFound } from "next/navigation";
import { renderProductPage } from "@/app/product/[slug]/page";

export const dynamic = "force-dynamic";

export default async function CanonicalProductPage({ params, searchParams }: {
  params: Promise<{ slug: string; categoryPublicId: string; productPublicId: string }>;
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { slug, categoryPublicId, productPublicId } = await params;
  if (!/^\d{9}$/.test(categoryPublicId) || !/^\d{9}$/.test(productPublicId)) notFound();
  return renderProductPage({
    publicId: productPublicId,
    canonicalCategory: { slug, publicId: categoryPublicId },
    searchParams,
    canonicalRequest: true,
  });
}
