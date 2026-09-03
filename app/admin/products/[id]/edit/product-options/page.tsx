import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../../../AdminSidebar";
import { saveProductOptions } from "./actions";
import ProductOptionsEditor from "./ProductOptionsEditor";

export const dynamic = "force-dynamic";

export default async function ProductOptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const { success, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");

  const [productResult, optionsResult] = await Promise.all([
    supabase.from("products").select("id, name, slug").eq("id", id).maybeSingle(),
    supabase
      .from("product_options")
      .select("id, option_name, denomination, denomination_currency, selling_price, is_active, is_in_stock")
      .eq("product_id", id)
      .eq("is_custom_value", false)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (!productResult.data) notFound();
  const product = productResult.data;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p>
              <h1 className="mt-2 text-3xl font-black">{product.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{product.slug}</p>
            </div>
            <Link href="/admin/products" className="h-fit rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">
              ← Product list
            </Link>
          </header>

          {success && <div role="status" className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 font-bold text-emerald-800 shadow-xl">✓ {success}</div>}
          {error && <div role="alert" className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-xl border border-red-300 bg-red-50 px-5 py-4 font-bold text-red-700 shadow-xl">{error}</div>}

          <div className="mt-8"><ProductEditPageTabs productId={id} current="product-options" /></div>

          <form action={saveProductOptions} className="mt-6 grid gap-6">
            <input type="hidden" name="id" value={id} />
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <ProductOptionsEditor
                productName={product.name}
                initialOptions={(optionsResult.data ?? []).map((option) => ({
                  id: option.id,
                  name: option.option_name,
                  denomination: Number(option.denomination ?? 1),
                  currency: option.denomination_currency ?? "INR",
                  sellingPrice: Number(option.selling_price),
                  isActive: option.is_active,
                  isInStock: option.is_in_stock !== false,
                }))}
              />
            </section>
            <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <input
                type="checkbox"
                name="preserve_discounted_prices"
                value="true"
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block font-black text-slate-900">Keep discounted customer prices unchanged</span>
                <span className="mt-1 block text-sm text-slate-600">
                  Use this when reducing every option by the same percentage. Existing customer discounts will be lowered automatically.
                </span>
              </span>
            </label>
            <div className="flex justify-end">
              <button className="rounded-xl bg-slate-900 px-7 py-3 font-black text-white">Save Product Options</button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
