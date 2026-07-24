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
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
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
  name: string;
  slug: string;
  image_url: string | null;
  price: number | string;
  badge: string | null;
  stock_quantity: number;
  rating: number | string;
  sold_count: number;
  product_type: ProductType;
  is_featured: boolean;
  product_options:
    | {
        stock_quantity: number;
        is_active: boolean;
      }[]
    | null;

  categories:
    | {
        short_name: string | null;
      }
    | {
        short_name: string | null;
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
          name,
          slug,
          image_url,
          price,
          badge,
          stock_quantity,
          rating,
          sold_count,
          product_type,
          is_featured,
          product_options (
            stock_quantity,
            is_active
          ),
          categories (
            short_name
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
    productRows.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image_url ?? "",
      price: Number(product.price),
      badge:
        product.badge ??
        "Digital Delivery",
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
      discountPercent: customerDiscounts.get(product.id) ?? 0,
    }));

  const featuredProducts =
    products.filter(
      (product) => product.isFeatured,
    );

  const popupRow =
    preorderPopupResult.data as PreorderPopupRow | null;

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
    popupRow.launch_date &&
    popupRow.game_title &&
    popupRow.image_url
      ? {
          gameTitle: popupRow.game_title,
          imageUrl: popupRow.image_url,
          launchDate: popupRow.launch_date,
          preorderPrice:
            popupRow.preorder_price === null
              ? null
              : Number(
                  popupRow.preorder_price,
                ),
          bonusText: popupRow.bonus_text,
          buttonText:
            popupRow.button_text ||
            "PREORDER NOW",
        }
      : null;

  const featuredProductsForDisplay: ProductCardData[] =
    preorderPopup
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

      {featuredProductsForDisplay.length > 0 && (
        <div><ProductSection
          id="featured-products"
          eyebrow="Best Sellers"
          title="Featured Products"
          description="Popular products selected for InGamePin customers."
          products={featuredProductsForDisplay}
        /></div>
      )}

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
