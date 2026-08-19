import Link from "next/link";

import HeroSlider, { type HeroSlide } from "@/components/HeroSlider";
import ProductCard, {
  type ProductCardData,
} from "@/components/ProductCard";
import ProductBrowser, {
  type BrowseProduct,
} from "@/components/ProductBrowser";
import PreorderPopup, {
  type PreorderPopupData,
} from "@/components/PreorderPopup";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import { getPaidProductSales } from "@/lib/product-sales";
import { getProductUrl } from "@/lib/product-url";
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
      .filter((product) => !product.is_bulk_order)
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
      stock: getAvailableStock(product),
      rating: Number(product.rating),
      sold:
        product.sold_count +
        (paidProductSales.get(product.id) ?? 0),
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {preorderPopup && (
        <PreorderPopup popup={preorderPopup} />
      )}

      {sliderSettingsResult.data?.is_enabled && (
        <HeroSlider
          slides={heroSlides}
          autoplayMs={sliderSettingsResult.data.autoplay_ms}
        />
      )}

      <section className="mx-auto max-w-7xl px-3 py-5 sm:px-5 sm:py-10">
        <SectionHeading
          eyebrow="Browse"
          title="Popular Categories"
          description="Explore game credits, keys, gift cards and subscriptions."
        />

        {categories.length > 0 ? (
          <div className="mt-4 grid grid-cols-4 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {categories.map(
              (category) => (
                <Link
                  key={category.id}
                  href={`/category/${category.slug}`}
                  aria-label={`View ${category.name}`}
                  className="group block min-w-0 rounded-xl border border-white/10 bg-white/5 px-1.5 py-3 text-center transition duration-300 hover:-translate-y-1 hover:border-cyan-400 hover:bg-white/10 sm:p-5 sm:text-left"
                >
                  <div className="text-2xl transition duration-300 group-hover:scale-110 sm:text-3xl">
                    {getCategoryIcon(
                      category.icon,
                    )}
                  </div>

                  <h3 className="mt-2 line-clamp-2 text-[10px] font-bold leading-3 text-white transition group-hover:text-cyan-400 sm:mt-4 sm:text-base sm:leading-normal">
                    {category.short_name ??
                      category.name}
                  </h3>

                  {category.description && (
                    <p className="mt-2 hidden line-clamp-2 text-xs leading-5 text-slate-500 sm:block">
                      {
                        category.description
                      }
                    </p>
                  )}

                  <p className="mt-4 hidden text-xs font-bold text-cyan-400 opacity-0 transition duration-300 group-hover:opacity-100 sm:block">
                    View Products {"→"}
                  </p>
                </Link>
              ),
            )}
          </div>
        ) : (
          <EmptySection message="No categories are currently available." />
        )}
      </section>

      <section className="mx-auto max-w-7xl px-3 pb-5 sm:px-5 sm:pb-10">
        <Link
          href="/products/bulk"
          className="group relative flex flex-col gap-5 overflow-hidden rounded-2xl border-2 border-cyan-400 bg-gradient-to-r from-cyan-100 via-white to-blue-200 p-5 shadow-lg shadow-cyan-200/60 ring-4 ring-cyan-100/70 transition hover:-translate-y-1 hover:border-cyan-500 hover:shadow-xl hover:shadow-cyan-200 sm:flex-row sm:items-center sm:justify-between sm:p-7"
        >
          <span
            aria-hidden="true"
            className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-cyan-300/30 blur-2xl"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-blue-300/30 blur-2xl"
          />

          <div className="relative z-10">
            <p className="inline-flex rounded-full bg-amber-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-950 shadow-sm sm:text-xs">
              For resellers &amp; businesses
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
              Need products in bulk quantity?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Explore bulk products with flexible quantities, competitive B2B pricing and dedicated support.
            </p>
          </div>

          <span className="relative z-10 inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-slate-950 bg-slate-950 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-slate-400/30 transition group-hover:border-cyan-600 group-hover:bg-cyan-600 group-hover:shadow-cyan-300/50">
            View B2B Bulk Products <span aria-hidden="true" className="ml-2">→</span>
          </span>
        </Link>
      </section>

      {featuredProductsForDisplay.length > 0 && (
        <div><ProductSection
          id="featured-products"
          eyebrow="Best Sellers"
          title="Featured Products"
          description="Popular products selected for InGamePin customers."
          products={featuredProductsForDisplay}
        /></div>
      )}

      <section className="mx-auto max-w-7xl px-3 pb-8 sm:px-5 sm:pb-12">
        <Link
          href="/affiliate-program"
          className="affiliate-home-banner group relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 shadow-xl shadow-slate-950/25 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-2xl hover:shadow-cyan-950/35 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
          <span aria-hidden="true" className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl transition duration-500 group-hover:bg-cyan-300/25" />
          <span aria-hidden="true" className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200 shadow-sm sm:text-xs">
              Affiliate Program
            </span>
            <h2 className="affiliate-home-banner-title mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
              Share products. Earn commission in USDT.
            </h2>
            <p className="affiliate-home-banner-description mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Create referral links for eligible products and earn from approved customer orders.
            </p>
          </div>
          <span className="relative z-10 inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-300 px-7 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/40 transition group-hover:border-white group-hover:bg-white sm:min-w-48">
            Learn &amp; Join <span aria-hidden="true" className="ml-2">{"→"}</span>
          </span>
        </Link>
      </section>

      {products.length > 0 && (
        <ProductBrowser products={products} />
      )}

      {products.length === 0 && (
        <section className="mx-auto max-w-7xl px-5 py-12">
          <EmptySection message="No active products are currently available." />
        </section>
      )}

      <section className="mt-8 border-y border-white/10 bg-slate-900">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-3 py-7 sm:gap-6 sm:px-5 sm:py-10 md:grid-cols-4">
          <StoreFeature
            icon="⚡"
            title="Fast Delivery"
            description="Receive digital products after payment verification and secure manual fulfillment."
          />

          <StoreFeature
            icon="✅"
            title="Genuine Products"
            description="Products sourced from trusted and verified suppliers."
          />

          <StoreFeature
            icon="🔒"
            title="Secure Checkout"
            description="Protected order processing and secure private-code delivery."
          />

          <StoreFeature
            icon="💬"
            title="Customer Support"
            description="Get assistance with orders, payments and redemption."
          />
        </div>
      </section>

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

type ProductSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  products: ProductCardData[];
};

function ProductSection({
  id,
  eyebrow,
  title,
  description,
  products,
}: ProductSectionProps) {
  return (
    <section
      id={id}
      className="mx-auto max-w-7xl scroll-mt-24 px-3 py-7 sm:px-5 sm:py-10"
    >
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
      />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-5 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
          />
        ))}
      </div>
    </section>
  );
}

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-widest text-cyan-400">
        {eyebrow}
      </p>

      <h2 className="mt-1 text-2xl font-black sm:text-3xl">
        {title}
      </h2>

      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      )}
    </div>
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

type StoreFeatureProps = {
  icon: string;
  title: string;
  description: string;
};

function StoreFeature({
  icon,
  title,
  description,
}: StoreFeatureProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p
        aria-hidden="true"
        className="text-2xl"
      >
        {icon}
      </p>

      <h3 className="mt-3 font-bold">
        {title}
      </h3>

      <p className="mt-1 text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
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
