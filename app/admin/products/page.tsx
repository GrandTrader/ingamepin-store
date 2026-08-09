import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { cloneProduct, createDraftProduct } from "./actions";

export const dynamic = "force-dynamic";

type AdminProductsPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    page?: string;
  }>;
};

const PRODUCTS_PER_PAGE = 10;

type ProductStatus = "ACTIVE" | "INACTIVE" | "DRAFT";

type ProductOptionRow = {
  selling_price: number | string;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number | string;
  currency: string;
  stock_quantity: number;
  status: ProductStatus;
  categories:
    | {
        name: string;
        short_name: string | null;
      }
    | {
        name: string;
        short_name: string | null;
      }[]
    | null;
  product_options: ProductOptionRow[] | null;
};

function getCategoryName(category: ProductRow["categories"]) {
  const value = Array.isArray(category) ? category[0] : category;
  return value?.short_name || value?.name || "Uncategorized";
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
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

function getPriceLabel(product: ProductRow) {
  const prices = (product.product_options ?? [])
    .filter((option) => option.is_active)
    .map((option) => Number(option.selling_price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  if (prices.length === 0) {
    return formatMoney(Number(product.price), product.currency);
  }

  const minimumPrice = Math.min(...prices);
  const maximumPrice = Math.max(...prices);

  if (minimumPrice === maximumPrice) {
    return formatMoney(minimumPrice, product.currency);
  }

  return `From ${formatMoney(minimumPrice, product.currency)}`;
}

function statusClass(status: ProductStatus) {
  if (status === "ACTIVE") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "DRAFT") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-slate-200 text-slate-600";
}

function readableStatus(status: ProductStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const { success, error, page: requestedPage } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

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
        name,
        slug,
        image_url,
        price,
        currency,
        stock_quantity,
        status,
        categories (
          name,
          short_name
        ),
        product_options (
          selling_price,
          is_active
        )
      `,
    )
    .eq("is_preorder_only", false)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (productResult.error) {
    throw new Error(
      `Unable to load products: ${productResult.error.message}`,
    );
  }

  const products = (productResult.data ?? []) as ProductRow[];
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const parsedPage = Number.parseInt(requestedPage ?? "1", 10);
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(parsedPage) ? parsedPage : 1),
  );
  const visibleProducts = products.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  );
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const viewResult = await supabase
    .from("product_views")
    .select("product_id")
    .gte("last_viewed_at", twentyFourHoursAgo);

  if (viewResult.error) {
    throw new Error(
      `Unable to load product views: ${viewResult.error.message}`,
    );
  }

  const viewsByProduct = new Map<string, number>();
  for (const view of viewResult.data ?? []) {
    viewsByProduct.set(
      view.product_id,
      (viewsByProduct.get(view.product_id) ?? 0) + 1,
    );
  }
  const totalViews24h = Array.from(viewsByProduct.values()).reduce(
    (total, count) => total + count,
    0,
  );

  const activeCount = products.filter(
    (product) => product.status === "ACTIVE",
  ).length;
  const lowStockCount = products.filter(
    (product) => product.stock_quantity <= 5,
  ).length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-black">Products</h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage products, prices, inventory and visibility.
              </p>
            </div>

            <form action={createDraftProduct}>
              <button className="w-full rounded-xl bg-slate-900 px-5 py-3 text-center font-bold text-white transition hover:bg-blue-600 sm:w-auto">
                + Add New Product
              </button>
            </form>
          </header>

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Total products</p>
              <p className="mt-2 text-3xl font-black">{products.length}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Active products</p>
              <p className="mt-2 text-3xl font-black text-emerald-600">
                {activeCount}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Low stock</p>
              <p className="mt-2 text-3xl font-black text-amber-600">
                {lowStockCount}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Visitors (24h)</p>
              <p className="mt-2 text-3xl font-black text-blue-600">
                {totalViews24h}
              </p>
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-xl font-black">Product list</h2>
              <p className="mt-1 text-sm text-slate-500">
                Select Edit to open the complete product settings.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-[900px] w-full border-collapse text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-bold">Product</th>
                    <th className="px-5 py-4 font-bold">Category</th>
                    <th className="px-5 py-4 text-right font-bold">Price</th>
                    <th className="px-5 py-4 text-center font-bold">Stock</th>
                    <th className="px-5 py-4 text-center font-bold">Views (24h)</th>
                    <th className="px-5 py-4 font-bold">Status</th>
                    <th className="px-5 py-4 text-right font-bold">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/products/${product.id}/edit/general`}
                          className="group flex min-w-[230px] items-center gap-3 rounded-xl transition hover:text-blue-600"
                        >
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image_url}
                              alt=""
                              className="h-12 w-12 rounded-xl border border-slate-200 object-fill"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-sm font-black text-blue-600">
                              {getInitials(product.name)}
                            </div>
                          )}

                          <div>
                            <p className="font-bold text-slate-900 transition group-hover:text-blue-600">{product.name}</p>
                            <p className="mt-1 text-xs text-slate-400">{product.slug}</p>
                          </div>
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                          {getCategoryName(product.categories)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right font-bold">
                        {getPriceLabel(product)}
                      </td>

                      <td className="px-5 py-4 text-center font-bold">
                        <span
                          className={
                            product.stock_quantity <= 5
                              ? "text-amber-600"
                              : "text-slate-700"
                          }
                        >
                          {product.stock_quantity}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center font-bold text-blue-600">
                        {viewsByProduct.get(product.id) ?? 0}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                            product.status,
                          )}`}
                        >
                          {readableStatus(product.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/product/${product.slug}`}
                            className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            View
                          </Link>

                          <form action={cloneProduct}>
                            <input type="hidden" name="product_id" value={product.id} />
                            <button
                              type="submit"
                              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
                            >
                              Clone
                            </button>
                          </form>

                          <Link
                            href={`/admin/products/${product.id}/edit/general`}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {products.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                        No products were found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <nav aria-label="Product list pages" className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <Link
                    key={pageNumber}
                    href={`/admin/products?page=${pageNumber}`}
                    aria-current={pageNumber === currentPage ? "page" : undefined}
                    className={`flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-black transition ${
                      pageNumber === currentPage
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600"
                    }`}
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


