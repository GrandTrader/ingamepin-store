import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { createCategory } from "./actions";

export const dynamic = "force-dynamic";

type CategoriesPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const { error, success } = await searchParams;
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

  const categoriesResult = await supabase
    .from("categories")
    .select(
      "id, name, slug, description, image_url, is_active, sort_order",
    )
    .order("sort_order", {
      ascending: true,
    })
    .order("name", {
      ascending: true,
    });

  if (categoriesResult.error) {
    throw new Error(
      `Unable to load categories: ${categoriesResult.error.message}`,
    );
  }

  const categories =
    (categoriesResult.data ?? []) as CategoryRow[];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header>
            <h1 className="text-3xl font-black">
              Product categories
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Create categories used by your store
              products.
            </p>
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

          <div className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">
                Add new category
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                The URL slug is created automatically
                from the category name.
              </p>

              <form
                action={createCategory}
                className="mt-6 space-y-5"
              >
                <label className="block">
                  <span className="text-sm font-bold">
                    Category name
                  </span>

                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="PlayStation"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold">
                    Description
                  </span>

                  <textarea
                    name="description"
                    rows={4}
                    maxLength={1000}
                    placeholder="Describe this product category."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold">
                    Category image URL
                  </span>

                  <input
                    name="image_url"
                    type="url"
                    placeholder="https://example.com/category.jpg"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold">
                    Sort order
                  </span>

                  <input
                    name="sort_order"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue="0"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    name="is_active"
                    type="checkbox"
                    defaultChecked
                    className="h-5 w-5 accent-blue-600"
                  />

                  <span>
                    <span className="block text-sm font-bold">
                      Active category
                    </span>

                    <span className="text-xs text-slate-500">
                      Available when adding products.
                    </span>
                  </span>
                </label>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-slate-900 px-5 py-3 font-black text-white transition hover:bg-blue-600"
                >
                  Create Category
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">
                    Existing categories
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {categories.length} categories
                  </p>
                </div>
              </div>

              {categories.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  No categories have been created.
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  {categories.map((category) => (
                    <article
                      key={category.id}
                      className="rounded-xl border border-slate-200 p-5"
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black">
                              {category.name}
                            </h3>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                category.is_active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {category.is_active
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            /category/{category.slug}
                          </p>

                          {category.description && (
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {category.description}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                          Sort: {category.sort_order}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}