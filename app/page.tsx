import Link from "next/link";

import HeroSlider, { type HeroSlide } from "@/components/HeroSlider";
import ProductCard from "@/components/ProductCard";
import type { BrowseProduct } from "@/components/ProductBrowser";
import PreorderPopup, {
  type PreorderPopupData,
} from "@/components/PreorderPopup";
import PopularProductsRow from "@/components/PopularProductsRow";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import { getHomepageData } from "@/lib/homepage-data";
import { getPaidProductSales } from "@/lib/product-sales";
import { getProductUrl } from "@/lib/product-url";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  public_id: number | string;
  name: string;
  short_name: string | null;
  slug: string;
  description: string | null;
  image_url: string | null;
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
  const [homepageData, customerDiscounts, paidProductSales] = await Promise.all([
    getHomepageData(),
    getSignedInCustomerDiscounts(),
    getPaidProductSales(),
  ]);

  const categories =
    homepageData.categories as CategoryRow[];

  const productRows =
    homepageData.products as ProductRow[];

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
      sold: Number(product.sold_count ?? 0) + (paidProductSales.get(product.id) ?? 0),
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

  const popupRow =
    homepageData.preorderPopup as PreorderPopupRow | null;
  const popupStoreProduct = popupRow?.product_id
    ? productRows.find((product) => product.id === popupRow.product_id) ?? null
    : null;
  const now = Date.now();
  const heroSlides: HeroSlide[] = homepageData.slides
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

  const rankedProducts = [...products]
    .sort((first, second) => second.sold - first.sold);
  const purchasedProducts = rankedProducts.filter(
    (product) => product.sold > 0,
  );
  const unsoldProducts = rankedProducts.filter(
    (product) => product.sold === 0,
  );
  const popularProducts = [
    ...purchasedProducts,
    ...unsoldProducts,
  ].slice(0, 24);

  return (
    <div className="market-home min-h-screen bg-[#f3f4f6] text-[#172033]">
      {preorderPopup && (
        <PreorderPopup popup={preorderPopup} />
      )}

      {homepageData.sliderSettings?.is_enabled && heroSlides.length > 0 && (
        <HeroSlider
          slides={heroSlides}
          autoplayMs={homepageData.sliderSettings.autoplay_ms}
        />
      )}

      <div className="mx-auto max-w-[1180px] space-y-4 px-3 py-5 sm:px-5 sm:py-8">
        <section className="rounded-[22px] bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-extrabold sm:text-2xl">Popular</h1>
            <Link href="/products" className="rounded-lg bg-[#f4f5f7] px-4 py-2 text-xs font-bold hover:bg-[#ff9418] hover:text-white">All</Link>
          </div>
          {popularProducts.length > 0 ? (
            <PopularProductsRow>
              {popularProducts.map((product) => (
                <div key={product.id} className="w-[165px] shrink-0 snap-start sm:w-[185px] lg:w-[195px]">
                  <ProductCard product={product} />
                </div>
              ))}
            </PopularProductsRow>
          ) : <EmptySection message="No active products are currently available." />}
        </section>

        <section className="rounded-[22px] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-extrabold sm:text-2xl">Product categories</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-slate-100">
                  {category.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={category.image_url}
                      alt={category.short_name ?? category.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span aria-hidden="true" className="text-4xl">
                      {getCategoryIcon(category.icon)}
                    </span>
                  )}
                </div>
                <span className="flex min-h-14 items-center justify-center border-t border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-extrabold leading-5 text-slate-800">
                  {category.short_name ?? category.name}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/products/bulk"
              className="b2b-home-button rounded-xl bg-[#17243d] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#243550]"
            >
              B2B digital products
            </Link>
            <Link
              href="/affiliate-program"
              className="rounded-xl bg-[#eef0f3] px-6 py-3 text-sm font-extrabold text-[#17243d] hover:bg-[#dfe3e8]"
            >
              Affiliate program
            </Link>
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
