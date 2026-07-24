import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CountrySelect from "@/components/CountrySelect";
import ResponsiveImageField from "@/components/ResponsiveImageField";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../../AdminSidebar";
import DeliveryInventoryField from "../../DeliveryInventoryField";
import DeliveryTypeSwitch from "../../DeliveryTypeSwitch";
import { updateProduct } from "../../actions";
import DeleteProductButton from "./DeleteProductButton";
import EditCategoryFields from "./EditCategoryFields";
import EditProductOptionsFields from "./EditProductOptionsFields";

export const dynamic = "force-dynamic";

type CategoryType =
  | "GAME_TOPUP"
  | "GIFT_CARD"
  | "SUBSCRIPTION"
  | "GAME_KEY";

type ProductStatus = "ACTIVE" | "INACTIVE" | "DRAFT";
type DeliveryType = "AUTOMATIC" | "MANUAL";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

type CategoryRow = {
  id: string;
  name: string;
  category_type: CategoryType;
};

type ProductOptionRow = {
  id: string;
  option_type:
    | "CURRENCY"
    | "IN_PLATFORM"
    | "OTHER";
  option_name: string;
  platform: string | null;
  denomination: number | string | null;
  denomination_currency: string | null;
  selling_price: number | string;
  stock_quantity: number;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  region: string;
  price: number | string;
  currency: string;
  badge: string | null;
  stock_quantity: number;
  status: ProductStatus;
  is_featured: boolean;
  delivery_type: DeliveryType;
  delivery_instructions: string | null;
  requires_customer_details: boolean;
  allows_fixed_values: boolean;
  allows_custom_value: boolean;
  minimum_custom_value: number | string | null;
  maximum_custom_value: number | string | null;
  allows_player_id_topup: boolean;
  allows_gaming_voucher: boolean;
  player_id_label: string | null;
};

export default async function EditProductPage({
  params,
  searchParams,
}: EditProductPageProps) {
  const { id } = await params;
  const { success, error } = await searchParams;
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

  const [
    productResult,
    categoryResult,
    optionResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
          id,
          category_id,
          name,
          slug,
          description,
          image_url,
          region,
          price,
          currency,
          badge,
          stock_quantity,
          status,
          is_featured,
          delivery_type,
          delivery_instructions,
          requires_customer_details,
          allows_fixed_values,
          allows_custom_value,
          minimum_custom_value,
          maximum_custom_value,
          allows_player_id_topup,
          allows_gaming_voucher,
          player_id_label
        `,
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("categories")
      .select("id, name, category_type")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("product_options")
      .select(
        `
          id,
          option_type,
          option_name,
          platform,
          denomination,
          denomination_currency,
          selling_price,
          stock_quantity,
          is_active
        `,
      )
      .eq("product_id", id)
      .eq("is_custom_value", false)
      .order("sort_order", { ascending: true }),
  ]);

  if (productResult.error) {
    throw new Error(
      `Unable to load product: ${productResult.error.message}`,
    );
  }

  if (categoryResult.error) {
    throw new Error(
      `Unable to load categories: ${categoryResult.error.message}`,
    );
  }

  if (optionResult.error) {
    throw new Error(
      `Unable to load product options: ${optionResult.error.message}`,
    );
  }

  if (!productResult.data) {
    notFound();
  }

  const product = productResult.data as ProductRow;
  const categories = (categoryResult.data ?? []) as CategoryRow[];
  const categoryChoices = categories.map((category) => ({
    id: category.id,
    name: category.name,
    categoryType: category.category_type,
  }));

  const productOptions =
    (optionResult.data ?? []) as ProductOptionRow[];

  const editableOptions = productOptions.map((option) => ({
    id: option.id,
    optionType: option.option_type,
    optionName: option.option_name,
    platform: option.platform,
    denomination:
      option.denomination === null
        ? null
        : Number(option.denomination),
    denominationCurrency:
      option.denomination_currency,
    sellingPrice: Number(option.selling_price),
    stockQuantity: option.stock_quantity,
    isActive: option.is_active,
  }));

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                Product settings
              </p>
              <h1 className="mt-2 text-3xl font-black">Edit product</h1>
              <p className="mt-1 text-sm text-slate-500">{product.slug}</p>
            </div>

            <Link
              href="/admin/products"
              className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
            >
              â† Product list
            </Link>
          </header>

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-medium text-emerald-700">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 font-medium text-red-700">
              {error}
            </div>
          )}

          <form action={updateProduct} className="mt-8 grid gap-6">
            <input type="hidden" name="id" value={product.id} />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Basic information</h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="text-sm font-bold">Product name</span>
                  <input
                    name="name"
                    defaultValue={product.name}
                    required
                    minLength={2}
                    maxLength={150}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <CountrySelect defaultValue={product.region} />

                <ResponsiveImageField
                  label="Product image"
                  name="image_url"
                  fileName="image_file"
                  defaultValue={product.image_url}
                  variant="product"
                />

                <label className="md:col-span-2">
                  <span className="text-sm font-bold">Description</span>
                  <textarea
                    name="description"
                    rows={6}
                    maxLength={5000}
                    defaultValue={product.description ?? ""}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Category settings</h2>
              <p className="mt-1 text-sm text-slate-500">
                Category controls the product behavior automatically.
              </p>

              <div className="mt-5">
                <EditCategoryFields
                  categories={categoryChoices}
                  currentCategoryId={product.category_id}
                  currentAllowsFixedValues={product.allows_fixed_values}
                  currentAllowsCustomValue={product.allows_custom_value}
                  currentMinimumCustomValue={
                    product.minimum_custom_value === null
                      ? null
                      : Number(product.minimum_custom_value)
                  }
                  currentMaximumCustomValue={
                    product.maximum_custom_value === null
                      ? null
                      : Number(product.maximum_custom_value)
                  }
                  currentAllowsPlayerIdTopup={product.allows_player_id_topup}
                  currentAllowsGamingVoucher={product.allows_gaming_voucher}
                  currentPlayerIdLabel={product.player_id_label}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Delivery</h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <DeliveryTypeSwitch
                  initialType={product.delivery_type}
                  productId={product.id}
                />

                <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    name="requires_customer_details"
                    type="checkbox"
                    defaultChecked={product.requires_customer_details}
                    className="h-5 w-5 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      Require customer details
                    </span>
                    <span className="text-xs text-slate-500">
                      Player ID, account ID or other delivery information.
                    </span>
                  </span>
                </label>

                <label className="md:col-span-2">
                  <span className="text-sm font-bold">
                    Delivery instructions
                  </span>
                  <textarea
                    name="delivery_instructions"
                    rows={4}
                    maxLength={2000}
                    defaultValue={product.delivery_instructions ?? ""}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Price and inventory</h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label>
                  <span className="text-sm font-bold">
                    Base price ({product.currency})
                  </span>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={Number(product.price)}
                    required
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <DeliveryInventoryField
                  initialType={product.delivery_type}
                  initialStock={product.stock_quantity}
                />

                <label className="md:col-span-2">
                  <span className="text-sm font-bold">Product badge</span>
                  <input
                    name="badge"
                    defaultValue={product.badge ?? ""}
                    maxLength={100}
                    placeholder="Secure Manual Delivery"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </section>

            <EditProductOptionsFields
              productId={product.id}
              initialOptions={editableOptions}
              initialDeliveryType={product.delivery_type}
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Visibility</h2>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label>
                  <span className="text-sm font-bold">Status</span>
                  <select
                    name="status"
                    defaultValue={product.status}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    name="is_featured"
                    type="checkbox"
                    defaultChecked={product.is_featured}
                    className="h-5 w-5 accent-blue-600"
                  />
                  <span className="text-sm font-bold">Show on homepage</span>
                </label>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                href={`/product/${product.slug}`}
                className="rounded-xl border border-slate-200 px-6 py-3 text-center font-bold transition hover:bg-slate-50"
              >
                View product
              </Link>

              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-7 py-3 font-black text-white transition hover:bg-blue-600"
              >
                Save all changes
              </button>
            </div>
          </form>

          <DeleteProductButton
            productId={product.id}
            productName={product.name}
          />
        </main>
      </div>
    </div>
  );
}


