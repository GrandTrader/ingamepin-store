import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { saveProductRestriction } from "./actions";
import DenominationQuantityEditor from "@/components/DenominationQuantityEditor";

export const dynamic = "force-dynamic";

export default async function RestrictionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const [productResult, restrictionResult, optionsResult] = await Promise.all([
    admin.from("products").select("id, name, slug, delivery_type, minimum_quantity, maximum_quantity").eq("id", id).maybeSingle(),
    admin.from("product_purchase_restrictions").select("*").eq("product_id", id).maybeSingle(),
    admin.from("product_options").select("id, option_name, denomination, denomination_currency, selling_price, minimum_quantity, maximum_quantity").eq("product_id", id).eq("is_active", true).order("sort_order"),
  ]);
  if (!productResult.data) notFound();
  const product = productResult.data;
  const rule = restrictionResult.data;

  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1></div><Link href="/admin/products" className="h-fit rounded-xl border px-5 py-3 font-bold">← Product list</Link></header>
    <div className="mt-8"><ProductEditPageTabs productId={id} current="restrictions" /></div>
    {messages.success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-700">{messages.success}</p>}
    {messages.error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{messages.error}</p>}
    <form action={saveProductRestriction} className="mt-6 rounded-2xl border border-slate-200 p-6 shadow-sm">
      <input type="hidden" name="id" value={id} />
      {product.delivery_type === "AUTOMATIC" ? <section className="mt-8 border-t pt-6">
        <label className="flex items-center gap-3 font-black"><input type="checkbox" name="is_enabled" defaultChecked={rule?.is_enabled ?? false} className="h-5 w-5" />Weekly purchase restriction ON</label>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="font-bold">Weekly purchase limit<input name="weekly_limit" type="number" min="1" step="1" defaultValue={rule?.weekly_limit ?? 25000} required className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
          <label className="font-bold">Limit currency<select name="limit_currency" defaultValue={rule?.limit_currency ?? "INR"} className="mt-2 w-full rounded-xl border px-4 py-3"><option>INR</option><option>USD</option></select></label>
          <label className="font-bold">Identify customer by<select name="identity_mode" defaultValue={rule?.identity_mode ?? "ACCOUNT_EMAIL_IP"} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="ACCOUNT_EMAIL_IP">User account + email + IP address</option><option value="ACCOUNT_EMAIL">User account + email</option><option value="IP">IP address only</option></select></label>
          <label className="font-bold">Reset period<select name="reset_mode" defaultValue={rule?.reset_mode ?? "ROLLING_7_DAYS"} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="ROLLING_7_DAYS">Every 7 days</option><option value="CALENDAR_WEEK">Calendar week</option></select></label>
          <label className="font-bold sm:col-span-2">Customer notification<textarea name="notification_message" rows={3} defaultValue={rule?.notification_message ?? "Weekly purchase limit reached. Please try again after your limit resets."} required className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        </div>
      </section> : <input type="hidden" name="weekly_limit" value={rule?.weekly_limit ?? 25000} />}
      <div className="mt-6 flex justify-end"><button className="admin-save-action rounded-xl px-6 py-3 font-black transition">Save restrictions</button></div>
    </form>
    <DenominationQuantityEditor productId={id} defaultMinimum={product.minimum_quantity ?? 1} defaultMaximum={product.maximum_quantity ?? 5} options={(optionsResult.data ?? []).map((option) => ({ id: option.id, name: option.option_name, denomination: option.denomination === null ? null : Number(option.denomination), currency: option.denomination_currency, sellingPrice: Number(option.selling_price), minimumQuantity: option.minimum_quantity, maximumQuantity: option.maximum_quantity }))} />
  </main></div></div>;
}
