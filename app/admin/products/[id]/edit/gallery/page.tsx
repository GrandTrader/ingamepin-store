import ProductSettingsActions from "@/components/ProductSettingsActions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import ResponsiveImageField from "@/components/ResponsiveImageField";
import { createClient } from "@/lib/supabase/server";
import { saveProductGallery, syncProductGalleryToDigiSeller } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductGalleryPage({ params, searchParams }: {
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
  const result = await supabase.from("products").select("id, name, slug, image_url, category_id").eq("id", id).maybeSingle();
  if (result.error) throw new Error(`Unable to load product: ${result.error.message}`);
  if (!result.data) notFound();
  const product = result.data;
  const categoryResult = product.category_id
    ? await supabase.from("categories").select("name, image_url").eq("id", product.category_id).maybeSingle()
    : null;
  const category = categoryResult?.data;
  let categoryImageUrl: string | null = null;
  if (category?.image_url) {
    try {
      const candidate = new URL(category.image_url, process.env.NEXT_PUBLIC_SITE_URL || "https://www.ingamepin.com");
      if (candidate.protocol === "https:" || candidate.protocol === "http:") categoryImageUrl = candidate.href;
    } catch { /* An invalid category URL should not prevent manual image upload. */ }
  }


  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-5">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-1 text-xl font-black sm:text-2xl">{product.name}</h1><p className="mt-1 break-all text-xs text-slate-500">{product.slug}</p></div><ProductSettingsActions slug={product.slug}><Link href="/admin/products" className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold">← Product list</Link></ProductSettingsActions></header>
    {success && <div data-editor-notice role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}{error && <div data-editor-notice role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="mt-4"><ProductEditPageTabs productId={id} current="gallery" /></div>
    <form action={saveProductGallery.bind(null, id)} className="mt-4 grid gap-3"><input type="hidden" name="retry_digiseller_sync" value={error?.startsWith("Gallery saved, but DigiSeller") ? "true" : "false"} /><section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div><h2 className="text-base font-black">Main product image</h2><p className="mt-1 text-xs text-slate-500">Used on the storefront and available to sync with DigiSeller.</p></div><div className="mt-3">{categoryResult?.error && <p role="alert" className="mb-3 text-sm text-red-700">Unable to load the category image. Refresh to try again, or upload an image below.</p>}<ResponsiveImageField compact categoryImage={category ? { name: category.name, url: categoryImageUrl } : undefined} label="Product image" name="image_url" fileName="image_file" defaultValue={product.image_url} variant="product" /></div></section><div className="flex justify-end"><button className="admin-save-action rounded-xl px-5 py-2.5 text-sm font-black">Save Gallery</button></div></form>
    <section className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"><div className="min-w-0"><h2 className="text-sm font-black">DigiSeller gallery</h2><p className="mt-1 max-w-3xl text-xs text-slate-600">Sync a copy with the InGamePin logo and region badge as the first image on connected DigiSeller products. Your website image stays unchanged.</p></div><form action={syncProductGalleryToDigiSeller.bind(null, id)} className="shrink-0"><button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Sync image to DigiSeller</button></form></section>
  </main></div></div>;
}
