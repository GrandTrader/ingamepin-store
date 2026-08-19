import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import CountrySelect from "@/components/CountrySelect";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import ResponsiveImageField from "@/components/ResponsiveImageField";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaidProductSales } from "@/lib/product-sales";
import { updateProductGeneral } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductGeneralPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const { success, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const [result, categoriesResult, popupResult, viewsResult, paidProductSales] = await Promise.all([
    supabase.from("products").select("id, category_id, name, name_ru, slug, description, description_ru, image_url, image_url_ru, region, sold_count, review_reward_enabled, review_reward_percent").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("preorder_popup_settings").select("product_id, is_enabled, image_url").eq("id", true).maybeSingle(),
    admin
      .from("product_views")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id)
      .gte("last_viewed_at", twentyFourHoursAgo),
    getPaidProductSales(),
  ]);

  if (result.error) throw new Error(`Unable to load product: ${result.error.message}`);
  if (viewsResult.error) throw new Error(`Unable to load product visitors: ${viewsResult.error.message}`);
  if (!result.data) notFound();
  const product = result.data;
  const totalSold =
    Number(product.sold_count ?? 0) + (paidProductSales.get(id) ?? 0);
  const visitorsLast24Hours = viewsResult.count ?? 0;
  const isPopupProduct = popupResult.data?.is_enabled === true && popupResult.data.product_id === id;
  const popupImageUrl = popupResult.data?.product_id === id ? popupResult.data.image_url : null;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p>
              <h1 className="mt-2 text-3xl font-black">Edit product</h1>
              <p className="mt-1 text-sm text-slate-500">{product.slug}</p>
            </div>
            <Link href="/admin/products" className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold">← Product list</Link>
          </header>

          {success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}
          {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

          <div className="mt-8"><ProductEditPageTabs productId={id} current="general" /></div>

          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Total units sold</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{totalSold.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-xs text-slate-500">Includes completed bulk-order quantities.</p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Visitors (24 hours)</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{visitorsLast24Hours.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-xs text-slate-500">Privacy-friendly unique product visitors.</p>
            </div>
          </section>

          <form action={updateProductGeneral} className="mt-6 grid gap-6">
            <input type="hidden" name="id" value={id} />
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">General</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="md:col-span-2"><span className="text-sm font-bold">Product name</span><input name="name" defaultValue={product.name} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                <label className="md:col-span-2"><span className="text-sm font-bold">Product name (Russian)</span><input name="name_ru" defaultValue={product.name_ru ?? ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                <label><span className="text-sm font-bold">Category</span><select name="category_id" defaultValue={product.category_id} required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3">{(categoriesResult.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <CountrySelect defaultValue={product.region} />
                <ResponsiveImageField label="Product image" name="image_url" fileName="image_file" defaultValue={product.image_url} variant="product" />
                <ResponsiveImageField
                  label="Product image (Russian)"
                  name="image_url_ru"
                  fileName="image_file_ru"
                  defaultValue={product.image_url_ru}
                  variant="product"
                  helpText="Shown when the customer selects Russian. If empty, the standard product image is used."
                />
                <label className="md:col-span-2"><span className="text-sm font-bold">Description</span><textarea name="description" rows={6} defaultValue={product.description ?? ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                <label className="md:col-span-2"><span className="text-sm font-bold">Description (Russian)</span><textarea name="description_ru" rows={6} defaultValue={product.description_ru ?? ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Positive feedback bonus</h2>
              <p className="mt-1 text-sm text-slate-600">
                Reward a registered customer with wallet credit after one verified positive review.
                Negative feedback receives no bonus and automatically creates a support case.
              </p>

              <div className="mt-5 grid gap-5 md:grid-cols-2 md:items-end">
                <label className="flex min-h-[74px] items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    name="review_reward_enabled"
                    defaultChecked={product.review_reward_enabled === true}
                    className="h-5 w-5 accent-emerald-600"
                  />
                  <span>
                    <span className="block font-black text-slate-900">Enable positive-review bonus</span>
                    <span className="mt-1 block text-xs text-slate-500">One wallet reward per delivered order.</span>
                  </span>
                </label>

                <label>
                  <span className="text-sm font-bold">Bonus percentage</span>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-500">
                    <input
                      name="review_reward_percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={Number(product.review_reward_percent ?? 0)}
                      className="min-w-0 flex-1 px-4 py-3 outline-none"
                    />
                    <span className="flex items-center border-l border-slate-200 px-4 font-black text-slate-500">%</span>
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="use_as_popup"
                  defaultChecked={isPopupProduct}
                  className="mt-1 h-5 w-5 accent-cyan-500"
                />
                <span>
                  <span className="block text-lg font-black">Use this product as homepage popup</span>
                  <span className="mt-1 block text-sm text-slate-600">Only one product popup can be active. Selecting this product replaces the current popup.</span>
                </span>
              </label>
              <input type="hidden" name="was_popup_product" value={popupResult.data?.product_id === id ? "true" : "false"} />
              <div className="mt-5">
                <ResponsiveImageField
                  label="Popup image"
                  name="popup_image_url"
                  fileName="popup_image_file"
                  defaultValue={popupImageUrl}
                  variant="product"
                />
                <p className="mt-2 text-xs text-slate-500">This image is used only inside the popup. The normal product image remains unchanged.</p>
              </div>
            </section>
            <div className="flex justify-end"><button type="submit" className="admin-save-action rounded-xl px-7 py-3 font-black transition">Save General</button></div>
          </form>
        </main>
      </div>
    </div>
  );
}
