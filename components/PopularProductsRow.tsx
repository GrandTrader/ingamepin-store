"use client";

import { useRef, useState, type ReactNode } from "react";
import { useStorePreferences } from "./StorePreferences";

export default function PopularProductsRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const { language } = useStorePreferences();

  return (
    <div className="relative">
      <div ref={rowRef} onScroll={(event) => setShowLeftArrow(event.currentTarget.scrollLeft > 8)} className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-12 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {showLeftArrow && (
        <button
          type="button"
          aria-label={language === "ru" ? "Показать предыдущие популярные товары" : "Show previous popular products"}
          onClick={() => rowRef.current?.scrollBy({ left: -Math.max(320, rowRef.current.clientWidth * 0.8), behavior: "smooth" })}
          className="absolute left-1 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl font-black text-slate-900 shadow-lg transition hover:bg-[#ff9418] hover:text-white"
        >
          ‹
        </button>
      )}
      <button
        type="button"
        aria-label={language === "ru" ? "Показать больше популярных товаров" : "Show more popular products"}
        onClick={() => rowRef.current?.scrollBy({ left: Math.max(320, rowRef.current.clientWidth * 0.8), behavior: "smooth" })}
        className="absolute right-1 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl font-black text-slate-900 shadow-lg transition hover:bg-[#ff9418] hover:text-white"
      >
        ›
      </button>
    </div>
  );
}
