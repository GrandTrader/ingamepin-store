import { renderProductPage } from "./ProductPageContent";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    ref?: string | string[];
  }>;
};

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { slug } = await params;
  return renderProductPage({ slug, searchParams });
}
