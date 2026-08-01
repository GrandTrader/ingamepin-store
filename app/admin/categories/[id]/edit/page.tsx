import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../../AdminSidebar";
import { updateCategory } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const result = await supabase.from("categories").select("id, name, slug, description, image_url, is_active, sort_order").eq("id", id).maybeSingle();
  if (!result.data) notFound();
  const category = result.data;

  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Category</p><h1 className="mt-2 text-3xl font-black">Edit {category.name}</h1><p className="mt-1 text-sm text-slate-500">/category/{category.slug}</p></div><Link href="/admin/categories" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">← Categories</Link></header>
    {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <form action={updateCategory} className="mt-8 max-w-2xl space-y-5 rounded-2xl border border-slate-200 p-6 shadow-sm">
      <input type="hidden" name="id" value={category.id} />
      <label className="block text-sm font-bold">Category name<input name="name" required minLength={2} maxLength={100} defaultValue={category.name} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
      <label className="block text-sm font-bold">Description<textarea name="description" rows={4} maxLength={1000} defaultValue={category.description ?? ""} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
      {category.image_url && <img src={category.image_url} alt="Current category" className="h-40 w-full rounded-xl border border-slate-200 object-cover" />}
      <label className="block text-sm font-bold">Image URL<input name="image_url" type="url" defaultValue={category.image_url ?? ""} placeholder="https://example.com/category.jpg" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
      <label className="block text-sm font-bold">Or upload a new image<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="mt-2 block w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-bold file:text-white" /></label>
      <label className="block text-sm font-bold">Sort order<input name="sort_order" type="number" min="0" step="1" required defaultValue={category.sort_order} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"><input name="is_active" type="checkbox" defaultChecked={category.is_active} className="h-5 w-5 accent-blue-600" />Active category</label>
      <button className="w-full rounded-xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700">Save category</button>
    </form>
  </main></div></div>;
}
