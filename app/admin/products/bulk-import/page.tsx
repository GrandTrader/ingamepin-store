import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "../../AdminSidebar";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CATALOG_SETTINGS } from "@/lib/catalog-import";
import BulkImportForm from "./BulkImportForm";

export const dynamic = "force-dynamic";
export default async function BulkProductImportPage() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access denied");
  const admin = createAdminClient();
  const [categories, settings] = await Promise.all([
    admin.from("categories").select("id,name,slug,category_type").eq("is_active", true).order("name"),
    admin.from("product_import_settings").select("markup_percent,inr_per_usd").eq("id", true).single(),
  ]);
  return <div className="min-h-screen bg-slate-100 text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-6">
    <Link href="/admin/products" className="font-bold text-blue-600">← Product list</Link>
    <h1 className="mt-4 text-2xl font-black">Bulk Product Import</h1>
    <p className="mt-2 text-slate-600">PlayStation India purchase assistance. Editions use your existing Product options. New products stay in Draft.</p>
    <p className="mt-2 text-sm text-slate-600">Customer information: PlayStation account email and PSN Online ID. No passwords or verification codes.</p>
    {(settings.error || categories.error) && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">{settings.error ? "The catalog import database update must be installed before preview or import." : "Categories could not be loaded. Refresh this page."}</p>}
    <BulkImportForm ready={!settings.error && !categories.error} categories={categories.data || []} initialSettings={settings.data ? { markup_percent: String(settings.data.markup_percent), inr_per_usd: String(settings.data.inr_per_usd) } : DEFAULT_CATALOG_SETTINGS} />
  </main></div></div>;
}
