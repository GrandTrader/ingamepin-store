"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  useStorePreferences,
  type StoreLanguage,
} from "./StorePreferences";

type CartItem = {
  cartId: string;
  quantity: number;
};

type SearchProduct = {
  id: string;
  name: string;
  nameRu: string | null;
  slug: string;
  href: string;
  image: string | null;
  imageRu: string | null;
  price: number;
  badge: string | null;
  category: string;
};

type HeaderCategory = {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  icon: string | null;
  sales: number;
};

export default function Header() {
  const pathname = usePathname();
  const hideProductSearch = [
    "/admin",
    "/vendor",
    "/seller",
  ].some(
    (section) =>
      pathname === section || pathname.startsWith(`${section}/`),
  );
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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const loadHeaderCategories = async () => {
      const [{ data: categoryRows }, { data: productRows }] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, short_name, slug, icon")
          .eq("is_active", true),
        supabase
          .from("products")
          .select("sold_count, stock_quantity, is_bulk_order, category_id, product_options(stock_quantity, is_active, is_in_stock)")
          .eq("status", "ACTIVE")
          .eq("is_preorder_only", false),
      ]);

      const salesByCategory = new Map<string, number>();
      for (const product of productRows ?? []) {
        const optionStock = (product.product_options ?? [])
          .filter((option) => option.is_active && option.is_in_stock !== false)
          .reduce((total, option) => total + Number(option.stock_quantity || 0), 0);
        const isAvailable =
          product.is_bulk_order ||
          Number(product.stock_quantity || 0) > 0 ||
          optionStock > 0;

        if (isAvailable && product.category_id) {
          salesByCategory.set(
            product.category_id,
            (salesByCategory.get(product.category_id) ?? 0) + Number(product.sold_count || 0),
          );
        }
      }

      if (active) {
        setHeaderCategories(
          (categoryRows ?? [])
            .filter((category) => salesByCategory.has(category.id))
            .map((category) => ({
              id: category.id,
              name: category.name,
              shortName: category.short_name,
              slug: category.slug,
              icon: category.icon,
              sales: salesByCategory.get(category.id) ?? 0,
            }))
            .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))
            .slice(0, 10),
        );
      }
    };

    void loadHeaderCategories();
    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    if (!isAuthenticated) {
      setWalletBalance(null);
      return;
    }

    let active = true;
    const loadWalletBalance = async () => {
      try {
        const response = await fetch("/api/wallet/balance", {
          cache: "no-store",
        });
        const result = (await response.json()) as { balance?: number };
        if (active && response.ok) {
          setWalletBalance(Math.max(0, Number(result.balance) || 0));
        }
      } catch {
        if (active) setWalletBalance(null);
      }
    };

    void loadWalletBalance();
    window.addEventListener("focus", loadWalletBalance);
    window.addEventListener("walletUpdated", loadWalletBalance);

    return () => {
      active = false;
      window.removeEventListener("focus", loadWalletBalance);
      window.removeEventListener("walletUpdated", loadWalletBalance);
    };
  }, [isAuthenticated]);

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

            <div className="max-[359px]:hidden">
              <p className="text-lg font-black leading-none sm:text-xl">
                iNgame<span className="text-cyan-400">PIN</span>
              </p>

              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 lg:block">
                {t("storeTagline")}
              </p>
            </div>
          </Link>

          <form action="/products" method="get" role="search" className="hidden min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-600 bg-white focus-within:border-[#ff9418] xl:flex">
            <label htmlFor="desktop-product-search" className="sr-only">{t("searchProducts")}</label>
            <input id="desktop-product-search" name="search" type="search" placeholder={t("searchPlaceholder")} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="submit" aria-label="Search" className="px-4 text-xl text-slate-500 transition hover:text-[#ff9418]">⌕</button>
          </form>

          {/* Header actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-1 xl:flex">
              <label htmlFor="store-language" className="sr-only">
                Language
              </label>
              <select
                id="store-language"
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as StoreLanguage)
                }
                className="h-10 rounded-xl border border-white/10 bg-slate-950 px-2 text-xs font-bold text-white outline-none transition hover:border-cyan-400"
              >
                <option value="en">🇺🇸 EN</option>
                <option value="de">🇩🇪 DE</option>
                <option value="ru">🇷🇺 RU</option>
                <option value="fr">🇫🇷 FR</option>
                <option value="zh">🇨🇳 中文</option>
                <option value="es">🇪🇸 ES</option>
                <option value="ar">🇸🇦 AR</option>
                <option value="th">🇹🇭 TH</option>
              </select>

              <label htmlFor="store-currency" className="sr-only">
                Currency
              </label>
              <select
                id="store-currency"
                value={currency}
                onChange={(event) =>
                  setCurrency(
                    event.target.value === "RUB"
                      ? "RUB"
                      : event.target.value === "INR"
                        ? "INR"
                        : "USD",
                  )
                }
                className="h-10 rounded-xl border border-white/10 bg-slate-950 px-2 text-xs font-bold text-white outline-none transition hover:border-cyan-400"
              >
                <option value="USD">$ USD</option>
                <option value="INR">₹ INR</option>
                <option value="RUB">₽ RUB</option>
              </select>
            </div>

            <Link href="/support" className="header-action hidden xl:flex"><span aria-hidden="true">●</span><span>Chat</span></Link>

            <Link href="/track-order" aria-label="Purchases" className="header-action hidden xl:flex">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v2" />
                <path d="M3 6.5v11A2.5 2.5 0 0 0 5.5 20H20a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 5.5" />
                <path d="M16 13h5" />
                <circle cx="16" cy="13" r=".5" fill="currentColor" />
              </svg>
              <span>Purchases</span>
            </Link>

            <Link href={isAuthenticated ? "/account/wallet" : "/account"} className="header-action hidden xl:flex"><span aria-hidden="true">▣</span><span>{isAuthenticated && walletBalance !== null ? `$${walletBalance.toFixed(2)}` : "Wallet"}</span></Link>

            <Link
              href="/cart"
              aria-label={`${t("cart")}: ${cartQuantity}`}
              className="header-action relative flex"
            >
              <span
                aria-hidden="true"
                className="text-xl"
              >
                {"\uD83D\uDED2"}
              </span>

              <span className="hidden xl:inline">{t("cart")}</span>

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
              aria-label={isAuthenticated ? t("myAccount") : t("login")}
              title={isAuthenticated ? t("myAccount") : t("login")}
              className="hidden h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 transition hover:bg-cyan-300 xl:flex"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              <span className="sr-only">
                {isAuthenticated ? t("myAccount") : t("login")}
              </span>
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl transition hover:border-cyan-400 sm:h-11 sm:w-11 xl:hidden"
            >
              <span aria-hidden="true">
                {isMenuOpen ? "\u2715" : "\u2630"}
              </span>
            </button>
          </div>
        </div>

        <nav aria-label="Store categories" className="hidden border-t border-white/10 bg-slate-950/75 xl:block">
          <div className="mx-auto flex max-w-7xl items-center gap-7 overflow-x-auto px-5 py-3 text-xs font-bold text-slate-300">
            <Link href="/products/bulk" className="header-category-link text-[#ff9b22]">▦ B2B</Link>
            {headerCategories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="header-category-link whitespace-nowrap"
              >
                {category.icon ? `${category.icon} ` : ""}
                {category.shortName ?? category.name}
              </Link>
            ))}
          </div>
        </nav>

        {!hideProductSearch &&
          !pathname.startsWith("/digiseller/usdt/") &&
          pathname !== "/checkout/payment" && (
          <div className="border-t border-white/10 bg-slate-950/70 px-3 py-2.5 sm:px-5 sm:py-3 xl:hidden">
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
                        href={product.href}
                        onClick={() => {
                          setIsSearchFocused(false);
                          setSearchQuery("");
                        }}
                        className="flex items-center gap-3 border-b border-white/10 p-3 transition last:border-b-0 hover:bg-white/5"
                      >
                        <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-400/10 font-black text-cyan-300">
                          {(language === "ru" && product.imageRu
                            ? product.imageRu
                            : product.image) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                language === "ru" && product.imageRu
                                  ? product.imageRu
                                  : product.image ?? ""
                              }
                              alt=""
                              onError={(event) => {
                                if (
                                  product.image &&
                                  event.currentTarget.dataset.fallbackApplied !== "true"
                                ) {
                                  event.currentTarget.dataset.fallbackApplied = "true";
                                  event.currentTarget.src = product.image;
                                  return;
                                }

                                event.currentTarget.style.display = "none";
                              }}
                              className="h-full w-full object-cover object-center"
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

        )}

        {/* Mobile navigation */}
        {isMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="absolute left-0 right-0 top-full max-h-[calc(100vh-3rem)] overflow-y-auto border-t border-white/10 bg-slate-900 px-3 py-4 shadow-2xl xl:hidden"
          >
            <div className="mx-auto grid max-w-7xl gap-1">
              <div className="mb-3 grid grid-cols-2 gap-2 border-b border-white/10 pb-4">
                <select
                  aria-label="Language"
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as StoreLanguage)
                  }
                  className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400"
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="ru">🇷🇺 Русский</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="zh">🇨🇳 中文</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="ar">🇸🇦 العربية</option>
                  <option value="th">🇹🇭 ไทย</option>
                </select>

                <select
                  aria-label="Currency"
                  value={currency}
                  onChange={(event) =>
                    setCurrency(
                      event.target.value === "RUB"
                        ? "RUB"
                        : event.target.value === "INR"
                          ? "INR"
                          : "USD",
                    )
                  }
                  className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400"
                >
                  <option value="USD">$ USD</option>
                  <option value="INR">₹ INR</option>
                  <option value="RUB">₽ RUB</option>
                </select>
              </div>

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

              <Link
                href="/products/bulk"
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl border-2 border-cyan-600 bg-cyan-400 px-4 py-3 font-black text-slate-950 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-300"
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden="true">{"\uD83D\uDCE6"}</span>
                  B2B Digital
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

              <div className="my-2 border-t border-white/10" />

              <Link
                href={isAuthenticated ? "/account/wallet" : "/account"}
                onClick={closeMenu}
                className="flex items-center justify-between rounded-xl border border-emerald-300/50 bg-emerald-400 px-4 py-3 font-black text-slate-950 transition hover:bg-emerald-300"
              >
                <span className="flex items-center gap-3">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v2" />
                    <path d="M3 6.5v11A2.5 2.5 0 0 0 5.5 20H20a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 5.5" />
                    <path d="M16 13h5" />
                  </svg>
                  {isAuthenticated && walletBalance !== null
                    ? `$${walletBalance.toFixed(2)}`
                    : "Wallet"}
                </span>
                <span aria-hidden="true">{"\u203A"}</span>
              </Link>

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

            </div>
          </nav>
        )}
      </header>
    </>
  );
}
