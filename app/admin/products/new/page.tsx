import Link from "next/link";
import { redirect } from "next/navigation";

import CountrySelect from "@/components/CountrySelect";
import { createClient } from "@/lib/supabase/server";

import AdminSidebar from "../../AdminSidebar";
import DeliveryInventoryField from "../DeliveryInventoryField";
import DeliveryTypeSwitch from "../DeliveryTypeSwitch";
import { createProduct } from "./actions";
import CategoryFields from "./CategoryFields";
import ProductNameSlugFields from "./ProductNameSlugFields";
import ProductOptionsFields from "./ProductOptionsFields";

export const dynamic = "force-dynamic";

type CategoryType =
  | "GAME_TOPUP"
  | "GIFT_CARD"
  | "SUBSCRIPTION"
  | "GAME_KEY";

type AddProductPageProps = {
  searchParams: Promise<{ error?: string }>;
};

type CategoryRow = {
  id: string;
  name: string;
  category_type: CategoryType;
};

export default async function AddProductPage({
  searchParams,
}: AddProductPageProps) {
  const { error } = await searchParams;
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

  const categoryResult = await supabase
    .from("categories")
    .select("id, name, category_type")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (categoryResult.error) {
    throw new Error(
      `Unable to load categories: ${categoryResult.error.message}`,
    );
  }

  const categories = (categoryResult.data ?? []) as CategoryRow[];
  const categoryChoices = categories.map((category) => ({
    id: category.id,
    name: category.name,
    categoryType: category.category_type,
  }));

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-black">Add new product</h1>
              <p className="mt-1 text-sm text-slate-500">
                Create a product and control its options, price and delivery.
              </p>
            </div>

            <Link
              href="/admin/products"
              className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
            >
              ← Products
            </Link>
          </header>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          <form action={createProduct} className="mt-8 grid gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Basic information</h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <ProductNameSlugFields />
                <CountrySelect defaultValue="India" />

                <label className="md:col-span-2">
                  <span className="text-sm font-bold">Description</span>
                  <textarea
                    name="description"
                    rows={5}
                    maxLength={5000}
                    placeholder="Describe the product, supported region and redemption requirements."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="text-sm font-bold">Product image URL</span>
                  <input
                    name="image_url"
                    type="url"
                    placeholder="https://example.com/product-image.jpg"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Category and delivery</h2>
              <p className="mt-1 text-sm text-slate-500">
                The selected category automatically controls the product behavior.
              </p>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <CategoryFields categories={categoryChoices} />

                <DeliveryTypeSwitch />

                <label className="md:col-span-2">
                  <span className="text-sm font-bold">Delivery instructions</span>
                  <textarea
                    name="delivery_instructions"
                    rows={4}
                    maxLength={2000}
                    placeholder="Example: Code is delivered after payment verification."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                  <input
                    name="requires_customer_details"
                    type="checkbox"
                    className="h-5 w-5 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      Require additional customer details
                    </span>
                    <span className="text-xs text-slate-500">
                      Use for player ID, account ID or other delivery information.
                    </span>
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Price and inventory</h2>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <label>
                  <span className="text-sm font-bold">Base price</span>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue="0"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="text-sm font-bold">Currency</span>
                  <input
                    name="currency"
                    required
                    minLength={3}
                    maxLength={3}
                    defaultValue="USD"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <DeliveryInventoryField />

                <label>
                  <span className="text-sm font-bold">Sort order</span>
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

                <label className="sm:col-span-2">
                  <span className="text-sm font-bold">Product badge</span>
                  <input
                    name="badge"
                    maxLength={100}
                    placeholder="Secure Manual Delivery"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="text-sm font-bold">Status</span>
                  <select
                    name="status"
                    defaultValue="DRAFT"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    name="is_featured"
                    type="checkbox"
                    className="h-5 w-5 accent-blue-600"
                  />
                  <span className="text-sm font-bold">Show on homepage</span>
                </label>
              </div>
            </section>

            <ProductOptionsFields />

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-7 py-3 font-black text-white transition hover:bg-blue-600"
              >
                Create Product
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
