"use client";

import Link from "next/link";
import { useState } from "react";
import CountryFlag from "./CountryFlag";
import { countryCode } from "@/lib/country-flag";
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
  const regionCode = countryCode(product.region);
  const regionLabel = regionCode ? regionCode.toUpperCase() : "Global";
  const russianImage = language === "ru" ? product.imageRu : null;
  const localizedImage =
    russianImage && !failedImages.includes(russianImage)
      ? russianImage
      : product.image && !failedImages.includes(product.image)
        ? product.image
        : "";

  const stockClassName = isOutOfStock
    ? "border-red-300 bg-red-500 text-white"
    : "border-emerald-300 bg-emerald-500 text-white";

  return (
    <Link
      href={
        product.href ??
        `/product/${product.slug}`
      }
      className="block"
    >
      <article className="product-card-standard group h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-xl">
        <div className="flex min-h-10 items-center justify-between gap-2 bg-slate-50 px-2 py-1.5">
          <span
            className={`rounded-md border px-2.5 py-1.5 text-[10px] font-black shadow-sm ${stockClassName}`}
          >
            {stockLabel}
          </span>

          <span className="inline-flex items-center gap-2 bg-transparent text-sm font-black text-slate-900">
            <CountryFlag region={product.region} className="h-6 w-8 shrink-0" /> {regionLabel}
          </span>
        </div>

        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#eef0f3]">
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
              className="h-full w-full object-contain transition duration-300"
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

        <div className="flex min-h-10 items-center bg-slate-50 px-2 py-1.5">
          <span
            className={`product-card-delivery-badge inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-black uppercase shadow-sm ${
              product.isInstantDelivery && !product.isBulkOrder
                ? "border-emerald-300 bg-emerald-400 text-slate-950"
                : "border-amber-300 bg-amber-300 text-slate-950"
            }`}
          >
            <span aria-hidden="true">
              {product.isInstantDelivery && !product.isBulkOrder ? "⚡" : "▦"}
            </span>
            {product.isInstantDelivery && !product.isBulkOrder
              ? language === "ru"
                ? "Мгновенная доставка"
                : "Instant Delivery"
              : language === "ru"
                ? "Цифровая доставка"
                : "Digital Delivery"}
          </span>
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
              className={`product-card-buy-button shrink-0 rounded-md px-2 py-1.5 text-[9px] font-bold transition sm:text-[10px] ${
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
