"use client";

import Link from "next/link";
import { useState } from "react";
import { useStorePreferences } from "./StorePreferences";

export type ProductCardData = {
  id: string;
  name: string;
  nameRu?: string | null;
  category: string;
  region?: string | null;
  price: number;
  image: string;
  imageRu?: string | null;
  badge: string;
  badgeRu?: string | null;
  stock: number;
  rating: number;
  sold: number;
  slug: string;
  href?: string;
  discountPercent?: number;
  isBulkOrder?: boolean;
  isInstantDelivery?: boolean;
};

type Props = {
  product: ProductCardData;
};

export default function ProductCard({ product }: Props) {
  const { language, t, formatPrice } = useStorePreferences();
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const isOutOfStock =
    !product.isBulkOrder && product.stock <= 0;

  const stockLabel = isOutOfStock
    ? t("outOfStock")
    : t("inStock");
  const discountPercent = Math.max(0, Number(product.discountPercent ?? 0));
  const customerPrice = product.price * (1 - discountPercent / 100);
  const localizedName =
    language === "ru" && product.nameRu ? product.nameRu : product.name;
  const localizedBadge = product.isBulkOrder
    ? "Digital Delivery"
    : language === "ru" && product.badgeRu
      ? product.badgeRu
      : product.badge;
  const russianImage = language === "ru" ? product.imageRu : null;
  const localizedImage =
    russianImage && !failedImages.includes(russianImage)
      ? russianImage
      : product.image && !failedImages.includes(product.image)
        ? product.image
        : "";

  const stockClassName = isOutOfStock
    ? "border-red-400/30 bg-red-400/10 text-red-300"
    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";

  return (
    <Link
      href={
        product.href ??
        `/product/${product.slug}`
      }
      className="block"
    >
      <article className="product-card-standard group h-full overflow-hidden rounded-xl bg-white transition duration-200 hover:-translate-y-1 hover:shadow-lg">
        <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-[#eef0f3]">
          {product.isBulkOrder && (
            <span className="absolute bottom-2 left-2 z-20 inline-flex items-center gap-1 rounded-md bg-amber-300 px-2 py-1 text-[9px] font-black uppercase text-slate-950 shadow-lg">
              <span aria-hidden="true">▦</span>
              Digital Delivery
            </span>
          )}

          {product.isInstantDelivery && !product.isBulkOrder && (
            <span className="absolute bottom-2 left-2 z-20 inline-flex items-center gap-1 rounded-md border border-white bg-emerald-400 px-2 py-1 text-[9px] font-black uppercase text-slate-950 shadow-lg">
              <span aria-hidden="true">⚡</span>
              {language === "ru" ? "Мгновенная доставка" : "Instant Delivery"}
            </span>
          )}

          <span className="absolute left-2 top-2 z-20 hidden rounded-md bg-slate-950/85 px-2 py-1 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm sm:inline-flex">
            {localizedBadge}
          </span>

          <span
            className={`absolute right-2 top-2 z-20 rounded-md border px-2 py-1 text-[9px] font-bold shadow-lg backdrop-blur-sm ${stockClassName}`}
          >
            {stockLabel}
          </span>

          <span className="absolute bottom-8 right-2 z-20 rounded-md bg-slate-950/85 px-2 py-1 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm">
            <span aria-hidden="true">🌐</span> {product.region || "Global"}
          </span>

          {localizedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={localizedImage}
              alt={localizedName}
              loading="lazy"
              onError={() =>
                setFailedImages((current) =>
                  current.includes(localizedImage)
                    ? current
                    : [...current, localizedImage],
                )
              }
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden="true"
              className="text-5xl sm:text-7xl"
            >
              {"\uD83C\uDFAE"}
            </div>
          )}

        </div>

        <div className="px-1 pb-2 pt-2">
          <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[#f28b0c] sm:text-[10px]">
            {product.category}
          </p>

          <h3 className="mt-1 line-clamp-2 min-h-9 text-xs font-bold leading-4 text-[#354052] sm:text-[13px]">
            {localizedName}
          </h3>

          <div className="mt-1.5 flex justify-between gap-1 text-[9px] text-slate-500 sm:text-[10px]">
            <span>
              <span aria-hidden="true">{"\u2B50"}</span>{" "}
              {product.rating}
            </span>

            <span>{product.sold} {t("sold")}</span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-1.5">
            <span className="min-w-0">
              {discountPercent > 0 && (
                <span className="block text-[10px] font-bold text-emerald-300 sm:text-xs">
                  {t("yourDiscount", { percent: discountPercent })}
                </span>
              )}
              <span className="flex flex-wrap items-baseline gap-1.5">
                <span className="truncate text-sm font-black text-[#172033] sm:text-base">
                  {formatPrice(customerPrice)}
                </span>
                {discountPercent > 0 && (
                  <span className="text-xs text-slate-500 line-through">
                    {formatPrice(product.price)}
                  </span>
                )}
              </span>
            </span>

            <span
              className={`shrink-0 rounded-md px-2 py-1.5 text-[9px] font-bold transition sm:text-[10px] ${
                isOutOfStock
                  ? "cursor-not-allowed bg-slate-700 text-slate-400"
                  : "bg-[#ff9418] text-white group-hover:bg-[#e67f00]"
              }`}
            >
              {isOutOfStock ? t("unavailable") : t("buy")}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
