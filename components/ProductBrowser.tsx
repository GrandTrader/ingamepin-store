"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ProductCard, {
  type ProductCardData,
} from "./ProductCard";

type ProductCategory =
  | "GAME_TOPUP"
  | "GIFT_CARD"
  | "SUBSCRIPTION"
  | "GAME_KEY"
  | "DIGITAL_PRODUCT";

export type BrowseProduct = ProductCardData & {
  productType: ProductCategory;
  isFeatured: boolean;
};

type SortValue =
  | "FEATURED"
  | "PRICE_LOW"
  | "PRICE_HIGH"
  | "BEST_SELLING"
  | "HIGHEST_RATED";

type FilterValue =
  | "ALL"
  | Exclude<
      ProductCategory,
      "DIGITAL_PRODUCT"
    >;

const filters: {
  value: FilterValue;
  label: string;
}[] = [
  {
    value: "ALL",
    label: "All Products",
  },
  {
    value: "GAME_TOPUP",
    label: "Gaming Top-Ups",
  },
  {
    value: "GIFT_CARD",
    label: "Gift Cards",
  },
  {
    value: "SUBSCRIPTION",
    label: "Subscriptions",
  },
  {
    value: "GAME_KEY",
    label: "Game Keys",
  },
];

const categorySections: {
  value: Exclude<FilterValue, "ALL">;
  title: string;
  description: string;
}[] = [
  {
    value: "GAME_TOPUP",
    title: "Gaming Top-Ups",
    description:
      "Player-ID top-ups and gaming voucher products.",
  },
  {
    value: "GIFT_CARD",
    title: "Gift Cards",
    description:
      "Fixed-value and custom-value digital gift cards.",
  },
  {
    value: "SUBSCRIPTION",
    title: "Subscriptions",
    description:
      "Digital membership plans and subscription vouchers.",
  },
  {
    value: "GAME_KEY",
    title: "Game Keys",
    description:
      "Game editions and activation keys for supported platforms.",
  },
];

export default function ProductBrowser({
  products,
}: {
  products: BrowseProduct[];
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<FilterValue>("ALL");
  const [sortBy, setSortBy] =
    useState<SortValue>("FEATURED");
  const [inStockOnly, setInStockOnly] =
    useState(false);
  const [expandedSections, setExpandedSections] =
    useState<string[]>([]);

  useEffect(() => {
    const query = new URLSearchParams(
      window.location.search,
    ).get("search");

    setSearch(query?.trim() ?? "");
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = products.filter(
      (product) => {
        const matchesCategory =
          activeFilter === "ALL" ||
          product.productType === activeFilter;

        const matchesSearch =
          query.length === 0 ||
          product.name
            .toLowerCase()
            .includes(query) ||
          product.category
            .toLowerCase()
            .includes(query) ||
          product.badge
            .toLowerCase()
            .includes(query);

        const matchesAvailability =
          !inStockOnly || product.stock > 0;

        return (
          matchesCategory &&
          matchesSearch &&
          matchesAvailability
        );
      },
    );

    return [...filtered].sort((first, second) => {
      switch (sortBy) {
        case "PRICE_LOW":
          return first.price - second.price;

        case "PRICE_HIGH":
          return second.price - first.price;

        case "BEST_SELLING":
          return second.sold - first.sold;

        case "HIGHEST_RATED":
          return second.rating - first.rating;

        case "FEATURED":
        default:
          return (
            Number(second.isFeatured) -
            Number(first.isFeatured)
          );
      }
    });
  }, [
    activeFilter,
    inStockOnly,
    products,
    search,
    sortBy,
  ]);

  const groupedProducts = useMemo(
    () =>
      categorySections
        .filter(
          (section) =>
            activeFilter === "ALL" ||
            section.value === activeFilter,
        )
        .map((section) => ({
          ...section,
          products: filteredProducts.filter(
            (product) =>
              product.productType === section.value,
          ),
        }))
        .filter(
          (section) => section.products.length > 0,
        ),
    [activeFilter, filteredProducts],
  );

  function countProducts(filter: FilterValue) {
    if (filter === "ALL") {
      return products.length;
    }

    return products.filter(
      (product) => product.productType === filter,
    ).length;
  }

  return (
    <section
      id="all-products"
      className="mx-auto max-w-7xl scroll-mt-24 px-3 py-7 sm:px-5 sm:py-10"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-400 sm:text-sm">
        Browse Store
      </p>

      <h2 className="mt-1 text-2xl font-black sm:text-3xl">
        <span className="sm:hidden">Trending Now</span>
        <span className="hidden sm:inline">Find Your Product</span>
      </h2>

      <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-slate-400 sm:block">
        Search the store or choose a product category.
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-2 sm:mt-6 sm:p-5">
        {search && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3">
            <p className="text-sm text-slate-300">
              Search results for:{" "}
              <span className="font-bold text-cyan-300">
                {search}
              </span>
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                window.history.replaceState(
                  null,
                  "",
                  "/#all-products",
                );
              }}
              className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
            >
              Clear search
            </button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex">
          {filters.map((filter) => {
            const active =
              activeFilter === filter.value;

            return (
              <button
                key={filter.value}
                type="button"
                onClick={() =>
                  setActiveFilter(filter.value)
                }
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:rounded-xl sm:px-4 sm:text-sm ${
                  active
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/10 bg-slate-950 text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
                }`}
              >
                {filter.label}

                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active
                      ? "bg-slate-950/15"
                      : "bg-white/10"
                  }`}
                >
                  {countProducts(filter.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 sm:mt-5 sm:flex-row sm:gap-3">
        <p className="text-xs text-slate-400 sm:text-sm">
          Showing {filteredProducts.length} product
          {filteredProducts.length === 1 ? "" : "s"}
        </p>

        <div className="flex items-center gap-2 sm:gap-3">
          <label className="hidden cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-300 transition hover:border-cyan-400/50 sm:flex">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) =>
                setInStockOnly(event.target.checked)
              }
              className="h-4 w-4 accent-cyan-400"
            />

            In Stock Only
          </label>

          <label className="flex min-w-0 items-center gap-2 text-sm text-slate-400 sm:gap-3">
            <span className="hidden shrink-0 font-bold sm:inline">
              Sort by
            </span>

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as SortValue,
                )
              }
              aria-label="Sort products"
              className="min-w-0 w-[115px] rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-[11px] font-bold text-white outline-none transition focus:border-cyan-400 sm:w-auto sm:rounded-xl sm:px-4 sm:text-sm"
            >
              <option value="FEATURED">
                Featured
              </option>
              <option value="PRICE_LOW">
                Price: Low to High
              </option>
              <option value="PRICE_HIGH">
                Price: High to Low
              </option>
              <option value="BEST_SELLING">
                Best Selling
              </option>
              <option value="HIGHEST_RATED">
                Highest Rated
              </option>
            </select>
          </label>
        </div>
      </div>

      {groupedProducts.length > 0 ? (
        <div className="mt-4 space-y-7 sm:space-y-12">
          {groupedProducts.map((section) => (
            <section
              key={section.value}
              id={section.value.toLowerCase()}
              className="scroll-mt-28"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <h3 className="text-xl font-black text-white sm:text-2xl">
                    {section.title}
                  </h3>

                  <p className="mt-1 hidden text-sm text-slate-400 sm:block">
                    {section.description}
                  </p>
                </div>

                <p className="text-xs font-bold text-cyan-400">
                  {section.products.length} product
                  {section.products.length === 1
                    ? ""
                    : "s"}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-5 lg:grid-cols-4">
                {(search ||
                expandedSections.includes(
                  section.value,
                )
                  ? section.products
                  : section.products.slice(0, 8)
                ).map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                  />
                ))}
              </div>

              {!search &&
                section.products.length > 8 && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSections(
                          (current) =>
                            current.includes(
                              section.value,
                            )
                              ? current.filter(
                                  (value) =>
                                    value !==
                                    section.value,
                                )
                              : [
                                  ...current,
                                  section.value,
                                ],
                        )
                      }
                      className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-6 py-3 text-sm font-black text-cyan-300 transition hover:bg-cyan-400 hover:text-slate-950"
                    >
                      {expandedSections.includes(
                        section.value,
                      )
                        ? "Show Fewer Products"
                        : `Show More ${section.title}`}
                    </button>
                  </div>
                )}
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="font-bold text-white">
            No products found
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Change the search, category or availability filter.
          </p>
        </div>
      )}
    </section>
  );
}
