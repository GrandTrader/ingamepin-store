import Link from "next/link";

import HeroSlider, { type HeroSlide } from "@/components/HeroSlider";
import LocalizedProductText from "@/components/LocalizedProductText";
import type { ProductCardData } from "@/components/ProductCard";
import type { BrowseProduct } from "@/components/ProductBrowser";
import PreorderPopup, {
  type PreorderPopupData,
} from "@/components/PreorderPopup";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import { getPaidProductSales } from "@/lib/product-sales";
import { getProductUrl } from "@/lib/product-url";
import CountryFlag from "@/components/CountryFlag";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  public_id: number | string;
  name: string;
  short_name: string | null;
  slug: string;
  description: string | null;
  icon: string | null;
};

type ProductType =
  | "GAME_TOPUP"
  | "GAME_KEY"
  | "GIFT_CARD"
  | "SUBSCRIPTION"
  | "DIGITAL_PRODUCT";

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
  product_type: ProductType;
  is_featured: boolean;
  is_bulk_order: boolean;
  delivery_type: string;
  product_options:
    | {
        stock_quantity: number;
        is_active: boolean;
        is_in_stock: boolean;
      }[]
    | null;

  categories:
    | {
        short_name: string | null;
        slug: string;
        public_id: number | string;
      }
    | {
        short_name: string | null;
        slug: string;
        public_id: number | string;
      }[]
    | null;
};

type StoreProduct = BrowseProduct & {
  productType: ProductType;
  isFeatured: boolean;
};

type PreorderPopupRow = {
  is_enabled: boolean;
  product_id: string | null;
  game_title: string;
  image_url: string;
  launch_date: string | null;
  preorder_price: number | string | null;
  sold_count: number;
  bonus_text: string;
  button_text: string;
};

function getCategoryIcon(
  icon: string | null,
) {
  const icons: Record<string, string> = {
    Game: "🎮",
    Steam: "💻",
    Apple: "🍎",
    Mobile: "📱",
    Gift: "🎁",
    Subscription: "⭐",
    Entertainment: "🎬",
    Shopping: "🛍️",
  };

  return icon
    ? icons[icon] ?? icon
    : "🎮";
}

function getProductCategory(
  category: ProductRow["categories"],
) {
  if (Array.isArray(category)) {
    return (
      category[0]?.short_name ??
      "Digital Product"
    );
  }

  return (
    category?.short_name ??
    "Digital Product"
  );
}

function getProductCategoryRow(category: ProductRow["categories"]) {
  return Array.isArray(category) ? category[0] : category;
}

function getStoreProductUrl(product: ProductRow) {
  const category = getProductCategoryRow(product.categories);

  if (!category) {
    return `/product/${encodeURIComponent(product.slug)}`;
  }

  return getProductUrl({
    categorySlug: category.slug,
    categoryPublicId: category.public_id,
    productPublicId: product.public_id,
  });
}

function getAvailableStock(
  product: ProductRow,
) {
  const activeOptions = (
    product.product_options ?? []
  ).filter(
    (option) =>
      option.is_active && option.is_in_stock !== false,
  );

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

export default async function Home() {
  const supabase = await createClient();

  const [
    categoryResult,
    productResult,
    preorderPopupResult,
    sliderSettingsResult,
    slidesResult,
  ] = await Promise.all([
    supabase
      .from("categories")
      .select(
        `
          id,
          public_id,
          name,
          short_name,
          slug,
          description,
          icon
        `,
      )
      .eq("is_active", true)
      .order("sort_order", {
        ascending: true,
      }),

    supabase
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
          product_type,
          is_featured,
          is_bulk_order,
          delivery_type,
          product_options (
            stock_quantity,
            is_active,
            is_in_stock
          ),
          categories (
            short_name,
            slug,
            public_id
          )
        `,
      )
      .eq("status", "ACTIVE")
      .eq("is_preorder_only", false)
      .order("sort_order", {
        ascending: true,
      }),

    supabase
      .from("preorder_popup_settings")
      .select(
        "is_enabled, product_id, game_title, image_url, launch_date, preorder_price, sold_count, bonus_text, button_text",
      )
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

  if (categoryResult.error) {
    throw new Error(
      `Unable to load categories: ${categoryResult.error.message}`,
    );
  }

  if (productResult.error) {
    throw new Error(
      `Unable to load products: ${productResult.error.message}`,
    );
  }

  if (preorderPopupResult.error) {
    throw new Error(
      `Unable to load preorder popup: ${preorderPopupResult.error.message}`,
    );
  }

  if (sliderSettingsResult.error || slidesResult.error) {
    throw new Error(
      `Unable to load homepage slider: ${
        sliderSettingsResult.error?.message ?? slidesResult.error?.message
      }`,
    );
  }

  const categories =
    (categoryResult.data ??
      []) as CategoryRow[];

  const productRows =
    (productResult.data ??
      []) as ProductRow[];

  const [customerDiscounts, paidProductSales] = await Promise.all([
    getSignedInCustomerDiscounts(),
    getPaidProductSales(),
  ]);

  const products: StoreProduct[] =
    productRows
      .map((product) => ({
      id: product.id,
      name: product.name,
      nameRu: product.name_ru,
      slug: product.slug,
      href: getStoreProductUrl(product),
      image: product.image_url ?? "",
      imageRu: product.image_url_ru,
      price: Number(product.price),
      badge:
        product.badge ??
        "Digital Delivery",
      badgeRu: product.badge_ru,
      region: product.region,
      stock: getAvailableStock(product),
      rating: Number(product.rating),
      sold: paidProductSales.get(product.id) ?? 0,
      category: getProductCategory(
        product.categories,
      ),
      productType:
        product.product_type,
      isFeatured:
        product.is_featured,
      isBulkOrder:
        product.is_bulk_order,
      isInstantDelivery:
        product.delivery_type === "AUTOMATIC",
      discountPercent: customerDiscounts.get(product.id) ?? 0,
      }));

  const featuredProducts =
    products.filter(
      (product) => product.isFeatured,
    );

  const popupRow =
    preorderPopupResult.data as PreorderPopupRow | null;
  const popupStoreProduct = popupRow?.product_id
    ? productRows.find((product) => product.id === popupRow.product_id) ?? null
    : null;
  const isIndependentPreorder = Boolean(popupRow?.launch_date && !popupStoreProduct);

  const now = Date.now();
  const heroSlides: HeroSlide[] = (slidesResult.data ?? [])
    .filter((slide) => {
      const starts = slide.starts_at ? new Date(slide.starts_at).getTime() : null;
      const ends = slide.ends_at ? new Date(slide.ends_at).getTime() : null;
      return (starts === null || starts <= now) && (ends === null || ends > now);
    })
    .map((slide) => ({
      id: slide.id,
      eyebrow: slide.eyebrow,
      title: slide.title,
      description: slide.description,
      desktopImageUrl: slide.desktop_image_url,
      mobileImageUrl: slide.mobile_image_url,
      buttonText: slide.button_text,
      buttonUrl: slide.button_url,
    }));

  const preorderPopup: PreorderPopupData | null =
    popupRow &&
    popupRow.game_title &&
    popupRow.image_url &&
    (popupStoreProduct || popupRow.launch_date)
      ? {
          gameTitle: popupStoreProduct?.name ?? popupRow.game_title,
          gameTitleRu: popupStoreProduct?.name_ru,
          imageUrl: popupRow.image_url,
          launchDate: popupRow.launch_date,
          preorderPrice:
            popupStoreProduct
              ? Number(popupStoreProduct.price)
              : popupRow.preorder_price === null
              ? null
              : Number(
                  popupRow.preorder_price,
                ),
          bonusText: popupRow.bonus_text,
          buttonText:
            popupRow.button_text ||
            "PREORDER NOW",
          href: popupStoreProduct ? getStoreProductUrl(popupStoreProduct) : "/preorder",
          eyebrow: popupStoreProduct ? "Featured Product" : "Game Preorder",
        }
      : null;

  const featuredProductsForDisplay: ProductCardData[] =
    preorderPopup && isIndependentPreorder
      ? [
          {
            id: "independent-preorder",
            name: preorderPopup.gameTitle,
            category: "Game Preorder",
            price:
              preorderPopup.preorderPrice ?? 0,
            image: preorderPopup.imageUrl,
            badge: "Preorder",
            stock: 999999,
            rating: 5,
            sold:
              Number(
                popupRow?.sold_count ?? 0,
              ) +
              (popupRow?.product_id
                ? paidProductSales.get(
                    popupRow.product_id,
                  ) ?? 0
                : 0),
            slug: "preorder",
            href: "/preorder",
          },
          ...featuredProducts,
        ]
      : featuredProducts;

  const rankedProducts = [...products]
    .sort((first, second) => second.sold - first.sold)
  const purchasedProducts = rankedProducts.filter(
    (product) => product.sold > 0,
  );
  const unsoldProducts = rankedProducts.filter(
    (product) => product.sold === 0,
  );
  const popularProducts = [
    ...purchasedProducts,
    ...unsoldProducts,
  ].slice(0, 16);

  return (
    <div className="market-home min-h-screen bg-[#f3f4f6] text-[#172033]">
      {preorderPopup && (
        <PreorderPopup popup={preorderPopup} />
      )}

      {sliderSettingsResult.data?.is_enabled && heroSlides.length > 0 && (
        <HeroSlider
          slides={heroSlides}
          autoplayMs={sliderSettingsResult.data.autoplay_ms}
        />
      )}

      <div className="mx-auto max-w-[1180px] space-y-4 px-3 py-5 sm:px-5 sm:py-8">
        <section className="rounded-[22px] bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-extrabold sm:text-2xl">Popular</h1>
            <Link href="/products" className="rounded-lg bg-[#f4f5f7] px-4 py-2 text-xs font-bold hover:bg-[#ff9418] hover:text-white">All</Link>
          </div>
          {popularProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-8">
              {popularProducts.map((product) => <MarketplaceCard key={product.id} product={product} />)}
            </div>
          ) : <EmptySection message="No active products are currently available." />}
        </section>

        <section className="rounded-[22px] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-extrabold sm:text-2xl">Explore the catalog</h2>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            <Link href="/products" className="market-tab market-tab-active">All products</Link>
            {categories.map((category) => (
              <Link key={category.id} href={`/category/${category.slug}`} className="market-tab">
                <span aria-hidden="true">{getCategoryIcon(category.icon)}</span>{category.short_name ?? category.name}
              </Link>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-8">
            {rankedProducts.map((product) => <MarketplaceCard key={product.id} product={product} />)}
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/products" className="rounded-xl bg-[#ff9418] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#e67f00]">View all products</Link>
            <Link href="/products/bulk" className="b2b-home-button rounded-xl bg-[#17243d] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#243550]">B2B bulk products</Link>
            <Link href="/affiliate-program" className="rounded-xl bg-[#eef0f3] px-6 py-3 text-sm font-extrabold text-[#17243d] hover:bg-[#dfe3e8]">Affiliate program</Link>
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-white/10 bg-slate-900/95 px-2 py-2 backdrop-blur sm:hidden">
        <MobileNavLink href="/" icon="⌂" label="Home" />
        <MobileNavLink href="/#all-products" icon="▦" label="Products" />
        <MobileNavLink href="/#all-products" icon="⌕" label="Search" />
        <MobileNavLink href="/track-order" icon="◎" label="Track" />
      </nav>

      <div className="h-16 sm:hidden" />
    </div>
  );
}

function MarketplaceCard({ product }: { product: ProductCardData }) {
  return (
    <Link href={product.href ?? `/product/${product.slug}`} className="group min-w-0">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#eef0f3] shadow-sm ring-1 ring-black/5 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg">
        <span className={`absolute left-2 top-2 z-10 rounded-md px-2 py-1 text-[9px] font-extrabold shadow-md ${
          product.isInstantDelivery && !product.isBulkOrder
            ? "bg-emerald-400 text-slate-950"
            : "bg-slate-950/90 text-white"
        }`}>
          {product.isInstantDelivery && !product.isBulkOrder
            ? "Instant Delivery"
            : "Digital Delivery"}
        </span>
        <span className="absolute bottom-8 right-2 z-10 rounded-md bg-slate-950/90 px-2 py-1 text-[9px] font-bold text-white shadow-md">
          <CountryFlag region={product.region} /> {product.region || "Global"}
        </span>
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#17243d] to-[#0d1830] text-4xl">🎮</div>}
      </div>
      <h3 className="mt-2 line-clamp-2 text-center text-xs font-bold leading-4 text-[#354052] transition group-hover:text-[#f28b0c] sm:text-[13px]">
        <LocalizedProductText english={product.name} russian={product.nameRu} />
      </h3>
    </Link>
  );
}

function EmptySection({
  message,
}: {
  message: string;
}) {
  return (
    <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
      {message}
    </p>
  );
}


function MobileNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-bold text-slate-400 transition hover:bg-white/5 hover:text-cyan-300"
    >
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </Link>
  );
}
