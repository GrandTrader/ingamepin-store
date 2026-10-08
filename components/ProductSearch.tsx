"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/NavigationLink";
import { storefrontSearchQuery } from "@/lib/storefront-search";
import { useStorePreferences } from "./StorePreferences";

type SearchProduct = {
  id: string;
  name: string;
  nameRu: string | null;
  href: string;
  image: string | null;
  imageRu: string | null;
  price: number;
  category: string;
};

export default function ProductSearch({ id, desktop = false }: { id: string; desktop?: boolean }) {
  const { language, currency, t, formatPrice } = useStorePreferences();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [result, setResult] = useState<{ query: string; products: SearchProduct[]; error?: boolean } | null>(null);
  const query = storefrontSearchQuery(value);
  const products = result?.query === query ? result.products : [];
  const loading = result?.query !== query;
  const expanded = open && query.length >= 2;
  const activeProduct = expanded ? products[activeIndex] : undefined;
  const resultsId = `${id}-results`;
  const allResultsUrl = `/products?search=${encodeURIComponent(query)}`;

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Search unavailable");
        const payload = await response.json() as { products?: SearchProduct[] };
        if (!controller.signal.aborted) {
          setResult({ query, products: Array.isArray(payload.products) ? payload.products : [] });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ query, products: [], error: true });
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={root} className="relative min-w-0" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <form action="/products" method="get" role="search" onSubmit={close}
        className={desktop
          ? "flex overflow-hidden rounded-xl border border-slate-600 bg-white focus-within:border-[#ff9418]"
          : "flex overflow-hidden rounded-xl border border-white/10 bg-slate-950 transition focus-within:border-cyan-400"}>
        <label htmlFor={id} className="sr-only">{t("searchProducts")}</label>
        <input id={id} name="search" type="search" role="combobox" value={value}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? resultsId : undefined}
          aria-activedescendant={activeProduct ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off" maxLength={100} placeholder={t("searchPlaceholder")}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && products.length) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(index => event.key === "ArrowDown"
                ? (index + 1) % products.length
                : (index <= 0 ? products.length : index) - 1);
            } else if (event.key === "Enter" && activeProduct) {
              event.preventDefault();
              close();
              router.push(activeProduct.href);
            }
          }}
          className={desktop
            ? "min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            : "min-h-11 min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 sm:px-4 sm:py-3 sm:text-sm"} />
        <button type="submit" aria-label={t("search")} className={desktop
          ? "px-4 text-xl text-slate-500 transition hover:text-[#ff9418]"
          : "shrink-0 bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:px-5"}>
          {desktop ? "⌕" : t("search")}
        </button>
      </form>

      {expanded && (
        <div className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-[min(32rem,60dvh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <div role="status" aria-live="polite" className={products.length ? "sr-only" : "p-4 text-sm text-slate-500"}>
            {loading ? t("searching") : result?.error
              ? (language === "ru" ? "Подсказки недоступны. Нажмите «Поиск», чтобы повторить." : "Suggestions are unavailable. Use Search to try again.")
              : products.length ? (language === "ru" ? `Найдено товаров: ${products.length}` : `${products.length} matching products`)
              : t("noResults")}
          </div>
          <ul id={resultsId} role="listbox" aria-label={t("searchProducts")}>
            {products.map((product, index) => (
              <li key={product.id} role="none">
                <Link id={`${id}-option-${index}`} role="option" aria-selected={index === activeIndex}
                  href={product.href} prefetch={false} onClick={close} onFocus={() => setActiveIndex(index)}
                  className={`flex items-center gap-3 border-b border-slate-100 p-3 transition hover:bg-cyan-50 focus:bg-cyan-50 focus:outline-none ${index === activeIndex ? "bg-cyan-50" : ""}`}>
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-50 font-black text-cyan-700">
                    {(language === "ru" && product.imageRu ? product.imageRu : product.image) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={language === "ru" && product.imageRu ? product.imageRu : product.image ?? ""} alt=""
                        onError={(event) => {
                          if (product.image && event.currentTarget.dataset.fallbackApplied !== "true") {
                            event.currentTarget.dataset.fallbackApplied = "true";
                            event.currentTarget.src = product.image;
                          } else event.currentTarget.style.display = "none";
                        }} className="h-full w-full object-cover object-center" />
                    ) : product.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold">{language === "ru" && product.nameRu ? product.nameRu : product.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{product.category}</p>
                  </div>
                  <p className="shrink-0 text-sm font-black text-cyan-700">{formatPrice(product.price, { maximumFractionDigits: currency === "RUB" ? 0 : 2 })}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={allResultsUrl} prefetch={false} onClick={close} className="block p-3 text-center text-sm font-bold text-cyan-700 hover:bg-cyan-50">
            {language === "ru" ? "Посмотреть все результаты" : "View all results"}
          </Link>
        </div>
      )}
    </div>
  );
}
