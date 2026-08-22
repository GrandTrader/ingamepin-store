import Link from "next/link";
import { notFound } from "next/navigation";

import ProductCard, {
  type ProductCardData,
} from "@/components/ProductCard";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import { getPaidProductSales } from "@/lib/product-sales";
import { getProductUrl } from "@/lib/product-url";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type CategoryRow = {
  id: string;
  public_id: number | string;
  name: string;
  short_name: string | null;
  description: string | null;
};

type ProductRow = {
  id: string;
  public_id: number | string;
  name: string;
  name_ru: string | null;
  slug: string;
  image_url: string | null;
  image_url_ru: string | null;
  price: number | string;
  badge: string | null;
  badge_ru: string | null;
  region: string | null;
  stock_quantity: number;
  rating: number | string;
  sold_count: number;
  is_bulk_order: boolean;
  delivery_type: string;
  product_options:
    | {
        selling_price: number | string;
        stock_quantity: number;
        is_active: boolean;
        is_in_stock: boolean;
      }[]
    | null;
};

function getStartingPrice(product: ProductRow) {
  const optionPrices = (product.product_options ?? [])
    .filter(
      (option) =>
        option.is_active && option.is_in_stock !== false,
    )
    .map((option) => Number(option.selling_price))
    .filter((price) => Number.isFinite(price) && price > 0);

  return optionPrices.length > 0
    ? Math.min(...optionPrices)
    : Number(product.price);
}

function getAvailableStock(product: ProductRow) {
  const activeOptions = (product.product_options ?? []).filter(
    (option) =>
      option.is_active && option.is_in_stock !== false,
  );

  if (activeOptions.length === 0) {
    return product.stock_quantity;
  }

  return activeOptions.reduce(
    (total, option) => total + Number(option.stock_quantity || 0),
    0,
  );
}

export default async function CategoryPage({
  params,
}: CategoryPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const categoryResult = await supabase
    .from("categories")
    .select("id, public_id, name, short_name, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (categoryResult.error) {
    throw new Error(
      `Unable to load category: ${categoryResult.error.message}`,
    );
  }

  if (!categoryResult.data) {
    notFound();
  }

  const category = categoryResult.data as CategoryRow;
  const productResult = await supabase
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
        badge_ru,
        region,
        stock_quantity,
        rating,
        sold_count,
        is_bulk_order,
        delivery_type,
        product_options (
          selling_price,
          stock_quantity,
          is_active,
          is_in_stock
        )
      `,
    )
    .eq("category_id", category.id)
    .eq("status", "ACTIVE")
    .eq("is_preorder_only", false)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true });

  if (productResult.error) {
    throw new Error(
      `Unable to load category products: ${productResult.error.message}`,
    );
  }

  const [customerDiscounts, paidProductSales] = await Promise.all([
    getSignedInCustomerDiscounts(),
    getPaidProductSales(),
  ]);
  const products = ((productResult.data ?? []) as ProductRow[]).map(
    (product): ProductCardData => ({
      id: product.id,
      name: product.name,
      nameRu: product.name_ru,
      slug: product.slug,
      href: getProductUrl({
        categorySlug: slug,
        categoryPublicId: category.public_id,
        productPublicId: product.public_id,
      }),
      image: product.image_url ?? "",
      imageRu: product.image_url_ru,
      price: getStartingPrice(product),
      badge: product.badge ?? "Digital Delivery",
      badgeRu: product.badge_ru,
      region: product.region,
      stock: getAvailableStock(product),
      rating: Number(product.rating),
      sold: paidProductSales.get(product.id) ?? 0,
      category: category.short_name ?? category.name,
      discountPercent: customerDiscounts.get(product.id) ?? 0,
      isBulkOrder: product.is_bulk_order,
      isInstantDelivery: product.delivery_type === "AUTOMATIC",
    }),
  ).sort((first, second) => second.sold - first.sold);

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-8 text-white sm:px-5 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <nav className="text-sm text-slate-400" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-cyan-400">
            Home
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <span className="text-white">
            {category.short_name ?? category.name}
          </span>
        </nav>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-400">
              Product category
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              {category.short_name ?? category.name}
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              {category.description ??
                `Browse all available ${category.name} products.`}
            </p>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-cyan-300">
            {products.length} product{products.length === 1 ? "" : "s"}
          </span>
        </div>

        {products.length > 0 ? (
          <section className="mt-8 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-8">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </section>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
            No active products are available in this category yet.
          </div>
        )}
      </div>
    </main>
  );
}
