import Link from "next/link";
import { redirect } from "next/navigation";

import { getProductUrl } from "@/lib/product-url";
import { getPaidProductSales } from "@/lib/product-sales";
import { isUnlimitedStock } from "@/lib/product-stock";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import {
  DeleteSelectedProductsButton,
  SelectAllProductsCheckbox,
} from "./ProductBulkSelection";
import {
  cloneProduct,
  createDraftProduct,
  deleteSelectedProducts,
  syncAllProductImagesToDigiSeller,
  syncAllDigiSellerStatistics,
  toggleProductSales,
} from "./actions";

export const dynamic = "force-dynamic";

type AdminProductsPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    page?: string;
    q?: string;
    status?: string;
    sort?: string;
  }>;
};

const PRODUCTS_PER_PAGE = 20;

type ProductStatus = "ACTIVE" | "INACTIVE" | "DRAFT";

type ProductOptionRow = {
  selling_price: number | string;
  stock_quantity: number;
  is_active: boolean;
  is_custom_value: boolean;
};

type ProductViewRow = {
  product_id: string;
};

type ProductRow = {
  id: string;
  public_id: number | string;
  name: string;
  slug: string;
  price: number | string;
  currency: string;
  stock_quantity: number;
  sold_count: number;
  bulk_discount_percent: number | string;
  status: ProductStatus;
  categories:
    | {
        name: string;
        short_name: string | null;
        slug: string;
        public_id: number | string;
      }
    | {
        name: string;
        short_name: string | null;
        slug: string;
        public_id: number | string;
      }[]
    | null;
  product_options: ProductOptionRow[] | null;
};

function getCategory(product: ProductRow) {
  return Array.isArray(product.categories)
    ? product.categories[0]
    : product.categories;
}

function getCategoryName(product: ProductRow) {
  const category = getCategory(product);
  return category?.short_name || category?.name || "Uncategorized";
}

function getAdminProductUrl(product: ProductRow) {
  const category = getCategory(product);

  return category
    ? getProductUrl({
        categorySlug: category.slug,
        categoryPublicId: category.public_id,
        productPublicId: product.public_id,
      })
    : `/product/${encodeURIComponent(product.slug)}`;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function getMinimumPrice(product: ProductRow) {
  const prices = (product.product_options ?? [])
    .filter((option) => option.is_active)
    .map((option) => Number(option.selling_price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  return prices.length
    ? Math.min(...prices)
    : Number(product.price);
}

function getPriceLabel(product: ProductRow) {
  const prices = (product.product_options ?? [])
    .filter((option) => option.is_active)
    .map((option) => Number(option.selling_price))
    .filter((price) => Number.isFinite(price) && price >= 0);
  const minimumPrice = getMinimumPrice(product);

  if (prices.length > 1 && Math.min(...prices) !== Math.max(...prices)) {
    return `From ${formatMoney(minimumPrice, product.currency)}`;
  }

  return formatMoney(minimumPrice, product.currency);
}

function getAvailableStock(product: ProductRow) {
  if (isUnlimitedStock(product.stock_quantity)) return "Unlimited";

  const activeOptions = (product.product_options ?? []).filter(
    (option) => option.is_active && !option.is_custom_value,
  );

  if (activeOptions.some((option) => isUnlimitedStock(option.stock_quantity))) {
    return "Unlimited";
  }

  if (activeOptions.length > 0) {
    return activeOptions.reduce(
      (total, option) =>
        total + Math.max(0, Number(option.stock_quantity) || 0),
      0,
    );
  }

  return Math.max(0, Number(product.stock_quantity) || 0);
}

function getAvailableLabel(product: ProductRow) {
  const availableStock = getAvailableStock(product);
  return availableStock === "Unlimited"
    ? availableStock
    : availableStock.toLocaleString("en-IN");
}

function buildPageUrl(
  page: number,
  filters: { q: string; status: string; sort: string },
) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status && filters.status !== "ALL") {
    query.set("status", filters.status);
  }
  if (filters.sort && filters.sort !== "ID_DESC") {
    query.set("sort", filters.sort);
  }
  if (page > 1) query.set("page", String(page));
  const value = query.toString();
  return value ? `/admin/products?${value}` : "/admin/products";
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const params = await searchParams;
  const success = params.success;
  const error = params.error;
  const search = String(params.q ?? "").trim();
  const requestedStatus = String(params.status ?? "ALL").toUpperCase();
  const status = ["ALL", "ACTIVE", "INACTIVE", "DRAFT"].includes(
    requestedStatus,
  )
    ? requestedStatus
    : "ALL";
  const requestedSort = String(params.sort ?? "ID_DESC").toUpperCase();
  const sort = ["ID_DESC", "ID_ASC", "NAME_ASC", "PRICE_ASC", "SOLD_DESC"].includes(
    requestedSort,
  )
    ? requestedSort
    : "ID_DESC";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const productResult = await supabase
    .from("products")
    .select(
      `
        id,
        public_id,
        name,
        slug,
        price,
        currency,
        stock_quantity,
        sold_count,
        bulk_discount_percent,
        status,
        categories (
          name,
          short_name,
          slug,
          public_id
        ),
        product_options (
          selling_price,
          stock_quantity,
          is_active,
          is_custom_value
        )
      `,
    )
    .eq("is_preorder_only", false);

  if (productResult.error) {
    throw new Error(`Unable to load products: ${productResult.error.message}`);
  }

  const allProducts = (productResult.data ?? []) as ProductRow[];
  const admin = createAdminClient();
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const [viewsResult, paidProductSales] = await Promise.all([
    admin
      .from("product_views")
      .select("product_id")
      .gte("last_viewed_at", twentyFourHoursAgo),
    getPaidProductSales(),
  ]);

  if (viewsResult.error) {
    throw new Error(
      `Unable to load product visitors: ${viewsResult.error.message}`,
    );
  }

  const viewsByProduct = new Map<string, number>();
  for (const row of (viewsResult.data ?? []) as ProductViewRow[]) {
    viewsByProduct.set(
      row.product_id,
      (viewsByProduct.get(row.product_id) ?? 0) + 1,
    );
  }
  const getTotalSold = (product: ProductRow) =>
    Number(product.sold_count ?? 0) + (paidProductSales.get(product.id) ?? 0);
  const normalizedSearch = search.toLocaleLowerCase();
  const filteredProducts = allProducts
    .filter((product) => {
      if (status !== "ALL" && product.status !== status) return false;
      if (!normalizedSearch) return true;

      return [
        product.name,
        String(product.public_id),
        getCategoryName(product),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
    })
    .sort((left, right) => {
      if (sort === "ID_ASC") {
        return Number(left.public_id) - Number(right.public_id);
      }
      if (sort === "NAME_ASC") {
        return left.name.localeCompare(right.name);
      }
      if (sort === "PRICE_ASC") {
        return getMinimumPrice(left) - getMinimumPrice(right);
      }
      if (sort === "SOLD_DESC") {
        return getTotalSold(right) - getTotalSold(left);
      }
      return Number(right.public_id) - Number(left.public_id);
    });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE),
  );
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(parsedPage) ? parsedPage : 1),
  );
  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  );
  const filters = { q: search, status, sort };

  const counts = {
    all: allProducts.length,
    active: allProducts.filter((product) => product.status === "ACTIVE").length,
    inactive: allProducts.filter((product) => product.status === "INACTIVE").length,
    draft: allProducts.filter((product) => product.status === "DRAFT").length,
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-bold">
                <form action={createDraftProduct}>
                  <button className="text-blue-600 transition hover:text-blue-800">
                    + Add new product
                  </button>
                </form>
                <Link href="/admin/homepage-slider" className="text-blue-600 hover:text-blue-800">
                  Advertise product
                </Link>
                <Link href="/admin/products?status=INACTIVE" className="text-blue-600 hover:text-blue-800">
                  Suspended sales
                </Link>
                <form action={syncAllProductImagesToDigiSeller}>
                  <button className="text-emerald-600 transition hover:text-emerald-800">
                    Sync all to DigiSeller
                  </button>
                </form>
                <form action={syncAllDigiSellerStatistics}>
                  <button className="text-violet-600 transition hover:text-violet-800">
                    Sync DigiSeller statistics
                  </button>
                </form>
                <span className="text-slate-400">
                  {filteredProducts.length} result{filteredProducts.length === 1 ? "" : "s"}
                </span>
              </div>

              <form className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_170px_170px_auto]" method="get">
                <input
                  name="q"
                  defaultValue={search}
                  placeholder="Product name or ID"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <select
                  name="status"
                  defaultValue={status}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Suspended</option>
                  <option value="DRAFT">Draft</option>
                </select>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="ID_DESC">Product ID ↓</option>
                  <option value="ID_ASC">Product ID ↑</option>
                  <option value="NAME_ASC">Product name</option>
                  <option value="PRICE_ASC">Lowest price</option>
                  <option value="SOLD_DESC">Best selling</option>
                </select>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
                  Apply
                </button>
              </form>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold">
              <Link href="/admin/products" className="rounded-full bg-white px-3 py-1.5 text-slate-600 shadow-sm">All {counts.all}</Link>
              <Link href="/admin/products?status=ACTIVE" className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">Active {counts.active}</Link>
              <Link href="/admin/products?status=INACTIVE" className="rounded-full bg-red-100 px-3 py-1.5 text-red-700">Suspended {counts.inactive}</Link>
              <Link href="/admin/products?status=DRAFT" className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-700">Draft {counts.draft}</Link>
            </div>

            {success && (
              <div className="m-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                {success}
              </div>
            )}
            {error && (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            <form id="bulk-delete-products" action={deleteSelectedProducts} />

            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">
                Select products using the checkboxes, then delete them together.
              </p>
              <DeleteSelectedProductsButton />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] border-collapse text-left text-sm">
                <thead className="border-b border-slate-300 bg-white text-xs font-black uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-center">Sales</th>
                    <th className="px-3 py-3">Item ID</th>
                    <th className="px-3 py-3">Item name</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-3 py-3 text-center">Discount</th>
                    <th className="px-3 py-3 text-center">Sold</th>
                    <th className="px-3 py-3 text-center">Visitors (24h)</th>
                    <th className="px-3 py-3 text-center">Available</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                    <th className="w-14 px-4 py-3 text-center">
                      <SelectAllProductsCheckbox />
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {visibleProducts.map((product) => {
                    const isActive = product.status === "ACTIVE";
                    const isDraft = product.status === "DRAFT";
                    const discount = Number(product.bulk_discount_percent);
                    const availableStock = getAvailableStock(product);

                    return (
                      <tr key={product.id} className="bg-white transition hover:bg-blue-50/40">
                        <td className="px-4 py-2.5 text-center">
                          {isDraft ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700">DRAFT</span>
                          ) : (
                            <form action={toggleProductSales}>
                              <input type="hidden" name="product_id" value={product.id} />
                              <input type="hidden" name="current_status" value={product.status} />
                              <button
                                type="submit"
                                title={isActive ? "Suspend product sales" : "Enable product sales"}
                                className={`relative h-6 w-12 rounded-full transition ${isActive ? "bg-emerald-500" : "bg-red-500"}`}
                              >
                                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${isActive ? "left-7" : "left-1"}`} />
                                <span className="sr-only">{isActive ? "Turn sales off" : "Turn sales on"}</span>
                              </button>
                            </form>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-bold text-slate-700">
                          {product.public_id}
                        </td>

                        <td className="px-3 py-2.5">
                          <Link
                            href={`/admin/products/${product.id}/edit/general`}
                            className="admin-product-name-link font-bold text-blue-600 underline-offset-2 hover:underline"
                          >
                            {product.name}
                          </Link>
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                          {getCategoryName(product)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-black text-slate-900">
                          {getPriceLabel(product)}
                        </td>

                        <td className="px-3 py-2.5 text-center">
                          {discount > 0 ? (
                            <span className="font-bold text-emerald-600">{discount}%</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="admin-product-sold-count px-3 py-2.5 text-center font-bold text-blue-600">
                          {getTotalSold(product).toLocaleString("en-IN")}
                        </td>

                        <td className="px-3 py-2.5 text-center font-bold text-cyan-700">
                          {(viewsByProduct.get(product.id) ?? 0).toLocaleString("en-IN")}
                        </td>

                        <td className="px-3 py-2.5 text-center">
                          <Link
                            href={`/admin/products/${product.id}/edit/stock`}
                            className={`font-black underline-offset-2 hover:underline ${availableStock !== "Unlimited" && availableStock <= 5 ? "admin-product-stock-low text-red-600" : "admin-product-stock-link text-blue-600"}`}
                          >
                            {getAvailableLabel(product)}
                          </Link>
                        </td>

                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Link href={getAdminProductUrl(product)} className="rounded-md px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900">View</Link>
                            <form action={cloneProduct}>
                              <input type="hidden" name="product_id" value={product.id} />
                              <button className="rounded-md px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-blue-100 hover:text-blue-700">Clone</button>
                            </form>
                            <Link href={`/admin/products/${product.id}/edit/general`} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-black text-slate-700 hover:border-blue-400 hover:text-blue-700">Edit</Link>
                          </div>
                        </td>

                        <td className="px-4 py-2.5 text-center">
                          <input
                            id={`select-product-${product.id}`}
                            type="checkbox"
                            name="product_ids"
                            value={product.id}
                            form="bulk-delete-products"
                            aria-label={`Select ${product.name}`}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {visibleProducts.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-5 py-16 text-center text-slate-500">
                        No products match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <nav aria-label="Product list pages" className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 p-4">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <Link
                    key={pageNumber}
                    href={buildPageUrl(pageNumber, filters)}
                    aria-current={pageNumber === currentPage ? "page" : undefined}
                    className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-xs font-black transition ${pageNumber === currentPage ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600"}`}
                  >
                    {pageNumber}
                  </Link>
                ))}
              </nav>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
