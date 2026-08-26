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
  const result = await supabase.from("products").select("id, name, slug, image_url").eq("id", id).maybeSingle();
  if (result.error) throw new Error(`Unable to load product: ${result.error.message}`);
  if (!result.data) notFound();
  const product = result.data;

  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.slug}</p></div><Link href="/admin/products" className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold">← Product list</Link></header>
    {success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}{error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="mt-8"><ProductEditPageTabs productId={id} current="gallery" /></div>
    <form action={saveProductGallery.bind(null, id)} className="mt-6 grid gap-6"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Gallery</p><h2 className="mt-2 text-xl font-black">Main product image</h2><p className="mt-1 text-sm text-slate-500">This image is used for the storefront and can be synchronized with DigiSeller.</p></div><div className="mt-5"><ResponsiveImageField label="Product image" name="image_url" fileName="image_file" defaultValue={product.image_url} variant="product" /></div></section><div className="flex justify-end"><button className="admin-save-action rounded-xl px-7 py-3 font-black">Save Gallery</button></div></form>
    <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6"><h2 className="text-xl font-black">DigiSeller gallery</h2><p className="mt-1 text-sm text-slate-600">Upload the saved main image to every DigiSeller product connected in the Stock tab and make it the first gallery image.</p><form action={syncProductGalleryToDigiSeller.bind(null, id)} className="mt-4"><button className="rounded-xl bg-slate-900 px-6 py-3 font-black text-white">Sync image to DigiSeller</button></form></section>
  </main></div></div>;
}
