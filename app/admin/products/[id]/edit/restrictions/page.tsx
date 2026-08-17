import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import DenominationQuantityEditor from "@/components/DenominationQuantityEditor";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import AdminSidebar from "../../../../AdminSidebar";
import { saveProductRestriction } from "./actions";

export const dynamic = "force-dynamic";

type RestrictionsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
};

const paymentMethods = [
  ["WALLET", "InGamePin Wallet", "Allow payment using customer wallet balance."],
  ["BINANCE_PAY", "Binance Pay", "Allow automatic payment through Binance Pay."],
  ["USDT_DIRECT", "Direct USDT", "Allow direct USDT through enabled networks."],
  ["PALLY", "PayPalych", "Allow payment through PayPalych."],
  ["FREEKASSA", "FreeKassa", "Allow payment through FreeKassa."],
] as const;

const usdtNetworks = [
  ["TRC20", "USDT TRC20", "TRON network"],
  ["BEP20", "USDT BEP20", "BNB Smart Chain"],
  ["SOLANA", "USDT Solana", "Solana network"],
] as const;

export default async function RestrictionsPage({ params, searchParams }: RestrictionsPageProps) {
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const [productResult, restrictionResult, optionsResult] = await Promise.all([
    admin
      .from("products")
      .select("id, name, slug, delivery_type, minimum_quantity, maximum_quantity, allowed_payment_methods, allowed_usdt_networks")
      .eq("id", id)
      .maybeSingle(),
    admin.from("product_purchase_restrictions").select("*").eq("product_id", id).maybeSingle(),
    admin
      .from("product_options")
      .select("id, option_name, denomination, denomination_currency, selling_price, minimum_quantity, maximum_quantity")
      .eq("product_id", id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (productResult.error) throw new Error(`Unable to load product restrictions: ${productResult.error.message}`);
  if (!productResult.data) notFound();
  if (restrictionResult.error) throw new Error(`Unable to load purchase restriction: ${restrictionResult.error.message}`);
  if (optionsResult.error) throw new Error(`Unable to load product options: ${optionsResult.error.message}`);

  const product = productResult.data;
  const rule = restrictionResult.data;
  const allowedPayments = new Set<string>(product.allowed_payment_methods ?? paymentMethods.map(([value]) => value));
  const allowedNetworks = new Set<string>(product.allowed_usdt_networks ?? usdtNetworks.map(([value]) => value));

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p>
              <h1 className="mt-2 text-3xl font-black">{product.name}</h1>
            </div>
            <Link href="/admin/products" className="h-fit rounded-xl border border-slate-200 px-5 py-3 font-bold">← Product list</Link>
          </header>

          <div className="mt-8"><ProductEditPageTabs productId={id} current="restrictions" /></div>
          {messages.success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-700">{messages.success}</p>}
          {messages.error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{messages.error}</p>}

          <form action={saveProductRestriction} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <input type="hidden" name="id" value={id} />

            <section>
              <h2 className="text-xl font-black">Accepted payment methods</h2>
              <p className="mt-1 text-sm text-slate-500">Only selected methods will be available when this product is in the cart.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {paymentMethods.map(([value, label, description]) => (
                  <label key={value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300">
                    <input type="checkbox" name={`payment_method_${value}`} defaultChecked={allowedPayments.has(value)} className="mt-1 h-5 w-5 shrink-0 accent-blue-600" />
                    <span><span className="block font-black">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
                  </label>
                ))}
              </div>
            </section>

            <section className="mt-7 border-t border-slate-200 pt-6">
              <h2 className="text-xl font-black">Direct USDT networks</h2>
              <p className="mt-1 text-sm text-slate-500">Used only when Direct USDT is enabled above.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {usdtNetworks.map(([value, label, description]) => (
                  <label key={value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300">
                    <input type="checkbox" name={`usdt_network_${value}`} defaultChecked={allowedNetworks.has(value)} className="mt-1 h-5 w-5 shrink-0 accent-blue-600" />
                    <span><span className="block font-black">{label}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
                  </label>
                ))}
              </div>
            </section>

            {product.delivery_type === "AUTOMATIC" ? (
              <section className="mt-7 border-t border-slate-200 pt-6">
                <label className="flex items-center gap-3 font-black"><input type="checkbox" name="is_enabled" defaultChecked={rule?.is_enabled ?? false} className="h-5 w-5 accent-blue-600" />Weekly purchase restriction ON</label>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="font-bold">Weekly purchase limit<input name="weekly_limit" type="number" min="1" step="1" defaultValue={rule?.weekly_limit ?? 25000} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                  <label className="font-bold">Limit currency<select name="limit_currency" defaultValue={rule?.limit_currency ?? "INR"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option>INR</option><option>USD</option></select></label>
                  <label className="font-bold">Identify customer by<select name="identity_mode" defaultValue={rule?.identity_mode ?? "ACCOUNT_EMAIL_IP"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="ACCOUNT_EMAIL_IP">User account + email + IP address</option><option value="ACCOUNT_EMAIL">User account + email</option><option value="IP">IP address only</option></select></label>
                  <label className="font-bold">Reset period<select name="reset_mode" defaultValue={rule?.reset_mode ?? "ROLLING_7_DAYS"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="ROLLING_7_DAYS">Every 7 days</option><option value="CALENDAR_WEEK">Calendar week</option></select></label>
                  <label className="font-bold sm:col-span-2">Customer notification<textarea name="notification_message" rows={3} defaultValue={rule?.notification_message ?? "Weekly purchase limit reached. Please try again after your limit resets."} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                </div>
              </section>
            ) : (
              <>
                <input type="hidden" name="weekly_limit" value={rule?.weekly_limit ?? 25000} />
                <input type="hidden" name="limit_currency" value={rule?.limit_currency ?? "INR"} />
                <input type="hidden" name="identity_mode" value={rule?.identity_mode ?? "ACCOUNT_EMAIL_IP"} />
                <input type="hidden" name="reset_mode" value={rule?.reset_mode ?? "ROLLING_7_DAYS"} />
                <input type="hidden" name="notification_message" value={rule?.notification_message ?? ""} />
              </>
            )}

            <div className="mt-6 flex justify-end"><button className="admin-save-action rounded-xl px-6 py-3 font-black transition">Save restrictions</button></div>
          </form>

          <DenominationQuantityEditor
            productId={id}
            defaultMinimum={product.minimum_quantity ?? 1}
            defaultMaximum={product.maximum_quantity ?? 5}
            options={(optionsResult.data ?? []).map((option) => ({
              id: option.id,
              name: option.option_name,
              denomination: option.denomination === null ? null : Number(option.denomination),
              currency: option.denomination_currency,
              sellingPrice: Number(option.selling_price),
              minimumQuantity: option.minimum_quantity,
              maximumQuantity: option.maximum_quantity,
            }))}
          />
        </main>
      </div>
    </div>
  );
}
