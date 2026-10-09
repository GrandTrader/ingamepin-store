import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "../../AdminSidebar";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CATALOG_SETTINGS } from "@/lib/catalog-import";
import BulkImportForm from "./BulkImportForm";
import PriceImportForm from "./PriceImportForm";

export const dynamic = "force-dynamic";
export default async function BulkProductImportPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const prices = (await searchParams).mode === "prices";
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
  const priceReady = prices ? await admin.rpc("bulk_price_snapshots", { p_ids: [] }) : null;
  return <div className="min-h-screen bg-slate-100 text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-6">
    <Link href="/admin/products" className="font-bold text-blue-600">← Product list</Link>
    <h1 className="mt-4 text-2xl font-black">Bulk Product Import</h1>
    <nav aria-label="Import type" className="mt-4 flex gap-2"><Link aria-current={!prices ? "page" : undefined} className={`rounded-lg px-4 py-2 font-bold ${!prices ? "bg-blue-600 text-white" : "bg-white text-blue-600"}`} href="/admin/products/bulk-import">Products</Link><Link aria-current={prices ? "page" : undefined} className={`rounded-lg px-4 py-2 font-bold ${prices ? "bg-blue-600 text-white" : "bg-white text-blue-600"}`} href="/admin/products/bulk-import?mode=prices">Prices &amp; discounts</Link></nav>
    {prices ? <>{priceReady?.error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">The bulk pricing database update must be installed before uploading.</p>}<PriceImportForm ready={!priceReady?.error} /></> : <><p className="mt-2 text-slate-600">PlayStation India purchase assistance. Editions use your existing Product options. New products stay in Draft.</p>
    <p className="mt-2 text-sm text-slate-600">Customer information uses the category’s configured fields. Protected Games details require a verified customer login and the protected-storage database update.</p>
    {(settings.error || categories.error) && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">{settings.error ? "The catalog import database update must be installed before preview or import." : "Categories could not be loaded. Refresh this page."}</p>}
    <BulkImportForm ready={!settings.error && !categories.error} categories={categories.data || []} initialSettings={settings.data ? { markup_percent: String(settings.data.markup_percent), inr_per_usd: String(settings.data.inr_per_usd) } : DEFAULT_CATALOG_SETTINGS} /></>}
  </main></div></div>;
}
