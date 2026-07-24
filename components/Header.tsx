"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useStorePreferences } from "./StorePreferences";

type CartItem = {
  cartId: string;
  quantity: number;
};

type SearchProduct = {
  id: string;
  name: string;
  nameRu: string | null;
  slug: string;
  image: string | null;
  price: number;
  badge: string | null;
  category: string;
};

export default function Header() {
  const {
    language,
    currency,
    setLanguage,
    setCurrency,
    t,
    formatPrice,
  } = useStorePreferences();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartQuantity, setCartQuantity] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchProducts, setSearchProducts] =
    useState<SearchProduct[]>([]);
  const [isSearchFocused, setIsSearchFocused] =
    useState(false);
  const [isSearching, setIsSearching] =
    useState(false);
  const [isAuthenticated, setIsAuthenticated] =
    useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setIsAuthenticated(Boolean(data.user));
      }
    });

    const { data: authListener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setIsAuthenticated(Boolean(session?.user));
      });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const updateCartQuantity = useCallback(() => {
    try {
      const savedCart = window.localStorage.getItem("shoppingCart");

      if (!savedCart) {
        setCartQuantity(0);
        return;
      }

      const parsedCart: unknown = JSON.parse(savedCart);

      if (!Array.isArray(parsedCart)) {
        setCartQuantity(0);
        return;
      }

      const quantity = parsedCart.reduce((total, item: unknown) => {
        if (
          typeof item !== "object" ||
          item === null ||
          !("quantity" in item)
        ) {
          return total;
        }

        const cartItem = item as Partial<CartItem>;
        const itemQuantity = Number(cartItem.quantity);

        return total + (
          Number.isFinite(itemQuantity) && itemQuantity > 0
            ? itemQuantity
            : 0
        );
      }, 0);

      setCartQuantity(quantity);
    } catch {
      setCartQuantity(0);
    }
  }, []);

  useEffect(() => {
    updateCartQuantity();

    window.addEventListener("cartUpdated", updateCartQuantity);
    window.addEventListener("storage", updateCartQuantity);

    return () => {
      window.removeEventListener(
        "cartUpdated",
        updateCartQuantity
      );

      window.removeEventListener(
        "storage",
        updateCartQuantity
      );
    };
  }, [updateCartQuantity]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchProducts([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        setIsSearching(true);

        try {
          const response = await fetch(
            `/api/products/search?q=${encodeURIComponent(query)}`,
            {
              signal: controller.signal,
            },
          );

          const result = (await response.json()) as {
            products?: SearchProduct[];
          };

          setSearchProducts(
            response.ok
              ? result.products ?? []
              : [],
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.name !== "AbortError"
          ) {
            setSearchProducts([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      },
      250,
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <>
      {/* Top information bar */}
      <div className="border-b border-white/10 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-3 py-1.5 text-center text-[10px] text-slate-300 sm:justify-between sm:px-5 sm:py-2 sm:text-xs">
          <p>
            <span aria-hidden="true">{"\u26A1"}</span>{" "}
            {t("digitalDelivery")}
          </p>

          <div className="hidden flex-wrap items-center justify-center gap-4 sm:flex">
            <span>
              <span aria-hidden="true">{"\u2705"}</span>{" "}
              {t("genuineProducts")}
            </span>

            <span>
              <span aria-hidden="true">{"\uD83D\uDD12"}</span>{" "}
              {t("securePayment")}
            </span>

            <Link
              href="/support"
              className="transition hover:text-cyan-400"
            >
              {t("customerSupport")}
            </Link>
          </div>
        </div>
      </div>

      {/* Main header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/95 text-white shadow-lg backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:h-20 sm:gap-5 sm:px-5">
          {/* Logo */}
          <Link
            href="/"
            onClick={closeMenu}
            className="flex shrink-0 items-center gap-2 sm:gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-base font-black text-slate-950 sm:h-11 sm:w-11 sm:text-xl">
              iP
            </div>

            <div>
              <p className="text-lg font-black leading-none sm:text-xl">
                iNgame<span className="text-cyan-400">PIN</span>
              </p>

              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 min-[380px]:block">
                {t("storeTagline")}
              </p>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-1 lg:flex"
          >
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              {t("home")}
            </Link>

            <Link
              href="/products/playstation"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              PlayStation
            </Link>

            <Link
              href="/products/steam"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              Steam
            </Link>

            <Link
              href="/products/apple"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              Apple
            </Link>

            <Link
              href="/products"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              {t("allProducts")}
            </Link>

            <Link
              href="/support"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              {t("support")}
            </Link>

            <Link
              href="/track-order"
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-cyan-400"
            >
              {t("trackOrder")}
            </Link>
          </nav>

          {/* Header actions */}
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 xl:flex">
              <label htmlFor="store-language" className="sr-only">
                Language
              </label>
              <select
                id="store-language"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value === "ru" ? "ru" : "en")
                }
                className="h-10 rounded-xl border border-white/10 bg-slate-950 px-2 text-xs font-bold text-white outline-none transition hover:border-cyan-400"
              >
                <option value="en">🇺🇸 EN</option>
                <option value="ru">🇷🇺 RU</option>
              </select>

              <label htmlFor="store-currency" className="sr-only">
                Currency
              </label>
              <select
                id="store-currency"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value === "RUB" ? "RUB" : "USD")
                }
                className="h-10 rounded-xl border border-white/10 bg-slate-950 px-2 text-xs font-bold text-white outline-none transition hover:border-cyan-400"
              >
                <option value="USD">$ USD</option>
                <option value="RUB">₽ RUB</option>
              </select>
            </div>

            <Link
              href="/cart"
              aria-label={`${t("cart")}: ${cartQuantity}`}
              className="relative flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 font-bold transition hover:border-cyan-400 sm:h-11"
            >
              <span
                aria-hidden="true"
                className="text-xl"
              >
                {"\uD83D\uDED2"}
              </span>

              <span className="hidden text-sm sm:inline">
                {t("cart")}
              </span>

              {cartQuantity > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-cyan-400 px-1 text-xs font-black text-slate-950">
                  {cartQuantity > 99 ? "99+" : cartQuantity}
                </span>
              )}
            </Link>

            <Link
              href={
                isAuthenticated
                  ? "/account/dashboard"
                  : "/account"
              }
              className="hidden h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:flex"
            >
              {isAuthenticated ? t("myAccount") : t("login")}
            </Link>

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen((current) => !current);
              }}
              aria-label={
                isMenuOpen
                  ? t("closeMenu")
                  : t("openMenu")
              }
              aria-expanded={isMenuOpen}
              aria-controls="mobile-navigation"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl transition hover:border-cyan-400 sm:h-11 sm:w-11 lg:hidden"
            >
              <span aria-hidden="true">
                {isMenuOpen ? "\u2715" : "\u2630"}
              </span>
            </button>
          </div>
        </div>

        <div className="border-t border-white/10 bg-slate-950/70 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="relative mx-auto max-w-3xl">
            <form
              action="/products"
              method="get"
              role="search"
              className="flex overflow-hidden rounded-xl border border-white/10 bg-slate-950 transition focus-within:border-cyan-400"
            >
              <label
                htmlFor="header-product-search"
                className="sr-only"
              >
                {t("searchProducts")}
              </label>

              <input
                id="header-product-search"
                name="search"
                type="search"
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                onFocus={() =>
                  setIsSearchFocused(true)
                }
                onBlur={() => {
                  window.setTimeout(
                    () =>
                      setIsSearchFocused(false),
                    150,
                  );
                }}
                autoComplete="off"
                placeholder={t("searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 sm:px-4 sm:py-3"
              />

              <button
                type="submit"
                className="shrink-0 bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:px-5"
              >
                {t("search")}
              </button>
            </form>

            {isSearchFocused &&
              searchQuery.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
                  {isSearching && (
                    <p className="p-4 text-sm text-slate-400">
                      {t("searching")}
                    </p>
                  )}

                  {!isSearching &&
                    searchProducts.length === 0 && (
                      <p className="p-4 text-sm text-slate-400">
                        {t("noResults")}
                      </p>
                    )}

                  {!isSearching &&
                    searchProducts.map((product) => (
                      <Link
                        key={product.id}
                        href={`/product/${product.slug}`}
                        onClick={() => {
                          setIsSearchFocused(false);
                          setSearchQuery("");
                        }}
                        className="flex items-center gap-3 border-b border-white/10 p-3 transition last:border-b-0 hover:bg-white/5"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cyan-400/10 font-black text-cyan-300">
                          {product.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image}
                              alt=""
                              className="h-full w-full object-fill"
                            />
                          ) : (
                            product.name
                              .charAt(0)
                              .toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">
                            {language === "ru" && product.nameRu
                              ? product.nameRu
                              : product.name}
                          </p>

                          <p className="mt-1 truncate text-xs text-slate-400">
                            {product.category}
                          </p>
                        </div>

                        <p className="shrink-0 text-sm font-black text-cyan-300">
                          {formatPrice(product.price, {
                            maximumFractionDigits: currency === "RUB" ? 0 : 2,
                          })}
                        </p>
                      </Link>
                    ))}
                </div>
              )}
          </div>
        </div>

        {/* Mobile navigation */}
        {isMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="absolute left-0 right-0 top-full max-h-[calc(100vh-3rem)] overflow-y-auto border-t border-white/10 bg-slate-900 px-3 py-4 shadow-2xl lg:hidden"
          >
            <div className="mx-auto grid max-w-7xl gap-1">
              <Link
                href="/"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\u2302"}</span>
                  {t("home")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <Link
                href="/category/gaming-top-ups"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\uD83C\uDFAE"}</span>
                  {t("gamingTopups")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <Link
                href="/category/gift-cards"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\uD83C\uDF81"}</span>
                  {t("giftCards")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <Link
                href="/category/subscriptions"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\u2605"}</span>
                  {t("subscriptions")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <Link
                href="/category/game-keys"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\uD83D\uDD11"}</span>
                  {t("gameKeys")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <div className="my-2 border-t border-white/10" />

              <Link
                href="/track-order"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\u2315"}</span>
                  {t("trackOrder")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <Link
                href="/support"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl px-4 py-3 font-bold text-slate-200 transition hover:bg-white/5 hover:text-cyan-400"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">?</span>
                  {t("customerSupport")}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <Link
                href={
                  isAuthenticated
                    ? "/account/dashboard"
                    : "/account"
                }
                onClick={closeMenu}
                className="mt-3 rounded-xl bg-cyan-400 px-4 py-3 text-center font-black text-slate-950 transition hover:bg-cyan-300"
              >
                {isAuthenticated ? t("myAccount") : t("login")}
              </Link>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-bold text-slate-400">
                  Language
                  <select
                    value={language}
                    onChange={(event) =>
                      setLanguage(
                        event.target.value === "ru" ? "ru" : "en",
                      )
                    }
                    className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-bold text-white outline-none"
                  >
                    <option value="en">🇺🇸 English</option>
                    <option value="ru">🇷🇺 Русский</option>
                  </select>
                </label>

                <label className="grid gap-1 text-xs font-bold text-slate-400">
                  Currency
                  <select
                    value={currency}
                    onChange={(event) =>
                      setCurrency(
                        event.target.value === "RUB" ? "RUB" : "USD",
                      )
                    }
                    className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm font-bold text-white outline-none"
                  >
                    <option value="USD">$ USD</option>
                    <option value="RUB">₽ RUB</option>
                  </select>
                </label>
              </div>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
