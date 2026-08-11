import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createClient } from "@/lib/supabase/server";
import { saveProductAffiliateSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductAffiliatePage({
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

  if (!user) {
    redirect("/admin/login");
  }

  const accessResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!accessResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const productResult = await supabase
    .from("products")
    .select(
      "id, name, slug, affiliate_enabled, affiliate_commission_percent",
    )
    .eq("id", id)
    .maybeSingle();

  if (productResult.error) {
    throw new Error(`Unable to load product: ${productResult.error.message}`);
  }

  if (!productResult.data) {
    notFound();
  }

  const product = productResult.data;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                Product settings
              </p>
              <h1 className="mt-2 text-3xl font-black">{product.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{product.slug}</p>
            </div>

            <Link
              href="/admin/products"
              className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold"
            >
              ← Product list
            </Link>
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

          <div className="mt-8">
            <ProductEditPageTabs productId={id} current="affiliate" />
          </div>

          <form
            action={saveProductAffiliateSettings}
            className="mt-6 grid gap-6"
          >
            <input type="hidden" name="id" value={id} />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div>
                <h2 className="text-xl font-black">Affiliate commission</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enable affiliate promotion and set the commission for this
                  product only.
                </p>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <input
                    name="affiliate_enabled"
                    type="checkbox"
                    defaultChecked={product.affiliate_enabled}
                    className="mt-0.5 h-5 w-5 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-black">
                      Allow affiliates to promote this product
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      The product becomes available for affiliate links only
                      while the main affiliate program is enabled.
                    </span>
                  </span>
                </label>

                <label>
                  <span className="text-sm font-bold">
                    Affiliate commission
                  </span>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-500">
                    <input
                      name="affiliate_commission_percent"
                      type="number"
                      min="0"
                      max="25"
                      step="0.01"
                      required
                      defaultValue={Number(
                        product.affiliate_commission_percent ?? 0,
                      )}
                      className="min-w-0 flex-1 px-4 py-3 outline-none"
                    />
                    <span className="border-l border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                      %
                    </span>
                  </div>
                  <span className="mt-2 block text-xs text-slate-500">
                    Allowed range: 0% to 25%.
                  </span>
                </label>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  When an affiliate link is used, this percentage is added to
                  that visitor&apos;s product price. The regular store price stays
                  unchanged.
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-7 py-3 font-black text-white transition hover:bg-blue-700"
              >
                Save Affiliate Settings
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
