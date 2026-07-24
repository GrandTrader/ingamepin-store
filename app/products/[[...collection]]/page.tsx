import Link from "next/link";
import { notFound } from "next/navigation";

import ProductCard, {
  type ProductCardData,
} from "@/components/ProductCard";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import { getPaidProductSales } from "@/lib/product-sales";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  params: Promise<{
    collection?: string[];
  }>;
};

type ProductRow = {
  id: string;
  name: string;
  name_ru: string | null;
  slug: string;
  image_url: string | null;
  price: number | string;
  badge: string | null;
  badge_ru: string | null;
  stock_quantity: number;
  rating: number | string;
  sold_count: number;
  categories:
    | {
        name: string;
        short_name: string | null;
      }
    | {
        name: string;
        short_name: string | null;
      }[]
    | null;
  product_options:
    | {
        platform: string | null;
        stock_quantity: number;
        is_active: boolean;
      }[]
    | null;
};

const collections = {
  all: {
    title: "All Products",
    description:
      "Browse gaming top-ups, gift cards, subscriptions and game keys.",
  },
  playstation: {
    title: "PlayStation Products",
    description:
      "PlayStation gift cards, memberships and compatible game keys.",
  },
  steam: {
    title: "Steam Products",
    description:
      "Steam Wallet gift cards and compatible PC game keys.",
  },
  apple: {
    title: "Apple Products",
    description:
      "Apple Store and iTunes gift cards starting from INR 100.",
  },
} as const;

type CollectionKey = keyof typeof collections;

function getCategory(product: ProductRow) {
  const category = Array.isArray(product.categories)
    ? product.categories[0]
    : product.categories;

  return category?.short_name ?? category?.name ?? "Digital Product";
}

function getAvailableStock(
  product: ProductRow,
) {
  const activeOptions = (
    product.product_options ?? []
  ).filter((option) => option.is_active);

  if (activeOptions.length === 0) {
    return product.stock_quantity;
  }

  return activeOptions.reduce(
    (total, option) =>
      total +
      Number(option.stock_quantity || 0),
    0,
  );
}

function matchesCollection(
  product: ProductRow,
  collection: CollectionKey,
) {
  if (collection === "all") {
    return true;
  }

  const category = Array.isArray(product.categories)
    ? product.categories[0]
    : product.categories;
  const platforms = (product.product_options ?? [])
    .map((option) => option.platform ?? "")
    .join(" ");
  const searchableText = [
    product.name,
    category?.name ?? "",
    category?.short_name ?? "",
    platforms,
  ]
    .join(" ")
    .toLowerCase();

  if (collection === "playstation") {
    return (
      searchableText.includes("playstation") ||
      searchableText.includes("ps4") ||
      searchableText.includes("ps5")
    );
  }

  if (collection === "steam") {
    return searchableText.includes("steam");
  }

  return (
    searchableText.includes("apple") ||
    searchableText.includes("itunes") ||
    searchableText.includes("app store")
  );
}

export default async function ProductsPage({
  params,
}: ProductsPageProps) {
  const { collection: segments } = await params;
  const requestedCollection = segments?.[0] ?? "all";

  if (
    segments &&
    (segments.length > 1 || !(requestedCollection in collections))
  ) {
    notFound();
  }

  const collection = requestedCollection as CollectionKey;
  const supabase = await createClient();
  const productResult = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        name_ru,
        slug,
        image_url,
        price,
        badge,
        badge_ru,
        stock_quantity,
        rating,
        sold_count,
        categories (
          name,
          short_name
        ),
        product_options (
          platform,
          stock_quantity,
          is_active
        )
      `,
    )
    .eq("status", "ACTIVE")
    .eq("is_preorder_only", false)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true });

  if (productResult.error) {
    throw new Error(
      `Unable to load products: ${productResult.error.message}`,
    );
  }

  const [customerDiscounts, paidProductSales] = await Promise.all([
    getSignedInCustomerDiscounts(),
    getPaidProductSales(),
  ]);
  const products = ((productResult.data ?? []) as ProductRow[])
    .filter((product) => matchesCollection(product, collection))
    .map(
      (product): ProductCardData => ({
        id: product.id,
        name: product.name,
        nameRu: product.name_ru,
        slug: product.slug,
        image: product.image_url ?? "",
        price: Number(product.price),
        badge: product.badge ?? "Digital Delivery",
        badgeRu: product.badge_ru,
        stock: getAvailableStock(product),
        rating: Number(product.rating),
        sold:
          product.sold_count +
          (paidProductSales.get(product.id) ?? 0),
        category: getCategory(product),
        discountPercent: customerDiscounts.get(product.id) ?? 0,
      }),
    );
  const details = collections[collection];

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-8 text-white sm:px-5 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <nav className="text-sm text-slate-400" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-cyan-400">
            Home
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <span className="text-white">{details.title}</span>
        </nav>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-400">
              Browse store
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              {details.title}
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              {details.description}
            </p>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-cyan-300">
            {products.length} product{products.length === 1 ? "" : "s"}
          </span>
        </div>

        {products.length > 0 ? (
          <section className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </section>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
            No active products are available in this collection yet.
          </div>
        )}
      </div>
    </main>
  );
}
