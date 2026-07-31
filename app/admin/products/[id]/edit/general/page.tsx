import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import CountrySelect from "@/components/CountrySelect";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import ResponsiveImageField from "@/components/ResponsiveImageField";
import { createClient } from "@/lib/supabase/server";
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

  const [result, categoriesResult] = await Promise.all([
    supabase.from("products").select("id, category_id, name, name_ru, slug, description, description_ru, image_url, region").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order"),
  ]);

  if (result.error) throw new Error(`Unable to load product: ${result.error.message}`);
  if (!result.data) notFound();
  const product = result.data;

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
                <label className="md:col-span-2"><span className="text-sm font-bold">Description</span><textarea name="description" rows={6} defaultValue={product.description ?? ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                <label className="md:col-span-2"><span className="text-sm font-bold">Description (Russian)</span><textarea name="description_ru" rows={6} defaultValue={product.description_ru ?? ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
              </div>
            </section>
            <div className="flex justify-end"><button type="submit" className="rounded-xl bg-slate-900 px-7 py-3 font-black text-white">Save General</button></div>
          </form>
        </main>
      </div>
    </div>
  );
}
