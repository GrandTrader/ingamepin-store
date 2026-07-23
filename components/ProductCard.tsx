"use client";

import Link from "next/link";
import { useState } from "react";

export type ProductCardData = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  badge: string;
  stock: number;
  rating: number;
  sold: number;
  slug: string;
  discountPercent?: number;
};

type Props = {
  product: ProductCardData;
};

export default function ProductCard({ product }: Props) {
  const [showImage, setShowImage] = useState(
    Boolean(product.image),
  );
  const isOutOfStock = product.stock <= 0;

  const stockLabel = isOutOfStock
    ? "Out of Stock"
    : "In Stock";
  const discountPercent = Math.max(0, Number(product.discountPercent ?? 0));
  const customerPrice = product.price * (1 - discountPercent / 100);

  const stockClassName = isOutOfStock
    ? "border-red-400/30 bg-red-400/10 text-red-300"
    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";

  return (
    <Link
      href={`/product/${product.slug}`}
      className="block"
    >
      <article className="group h-full overflow-hidden rounded-xl border border-white/10 bg-slate-900 transition duration-300 hover:-translate-y-2 hover:border-cyan-400 sm:rounded-2xl">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-slate-800 to-slate-700">
          <span className="absolute left-2 top-2 z-20 hidden rounded-full border border-white/10 bg-slate-950/85 px-2 py-1 text-[10px] font-bold text-cyan-300 shadow-lg backdrop-blur-sm sm:left-3 sm:top-3 sm:inline-flex sm:px-3 sm:text-xs">
            {product.badge}
          </span>

          <span
            className={`absolute right-2 top-2 z-20 rounded-full border px-2 py-1 text-[9px] font-bold shadow-lg backdrop-blur-sm sm:right-3 sm:top-3 sm:px-3 sm:text-xs ${stockClassName}`}
          >
            {stockLabel}
          </span>

          {showImage ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              onError={() => setShowImage(false)}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden="true"
              className="text-5xl sm:text-7xl"
            >
              {"\uD83C\uDFAE"}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-slate-900 to-transparent" />
        </div>

        <div className="p-3 sm:p-5">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-cyan-400 sm:text-xs sm:tracking-widest">
            {product.category}
          </p>

          <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold sm:mt-2 sm:min-h-12 sm:text-base">
            {product.name}
          </h3>

          <div className="mt-2 flex justify-between gap-1 text-[10px] text-slate-400 sm:mt-3 sm:text-sm">
            <span>
              <span aria-hidden="true">{"\u2B50"}</span>{" "}
              {product.rating}
            </span>

            <span>{product.sold} Sold</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 sm:mt-5">
            <span className="min-w-0">
              {discountPercent > 0 && (
                <span className="block text-[10px] font-bold text-emerald-300 sm:text-xs">
                  Your {discountPercent}% discount
                </span>
              )}
              <span className="flex flex-wrap items-baseline gap-1.5">
                <span className="truncate text-lg font-black sm:text-2xl">
                  ${customerPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {discountPercent > 0 && (
                  <span className="text-xs text-slate-500 line-through">
                    ${product.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </span>
            </span>

            <span
              className={`shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-bold transition sm:px-4 sm:py-2 sm:text-base ${
                isOutOfStock
                  ? "cursor-not-allowed bg-slate-700 text-slate-400"
                  : "bg-cyan-400 text-slate-950 group-hover:bg-cyan-300"
              }`}
            >
              {isOutOfStock ? "Unavailable" : "Buy"}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
