import { purchaseResetPeriods, purchaseLimitMessage } from "@/lib/purchase-restriction";
import { restrictionCurrencies } from "@/lib/purchase-restriction-currencies";
import { hasInstantDelivery } from "@/lib/product-delivery";
import ProductSettingsActions from "@/components/ProductSettingsActions";
import { getProductPaypalychRestriction } from "@/lib/paypalych-product-policy-server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import DenominationQuantityEditor from "@/components/DenominationQuantityEditor";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import AdminSidebar from "../../../../AdminSidebar";
import { saveProductRestriction, exemptCustomerFromPurchaseRestriction, restoreCustomerPurchaseRestriction } from "./actions";

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
  ["UPI", "Manual Crypto", "Allow manual USDT BEP20 verification."],
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
  const [productResult, restrictionResult, optionsResult, exemptionsResult] = await Promise.all([
    admin
      .from("products")
      .select("id, name, slug, delivery_type, stock_source, is_bulk_order, minimum_quantity, maximum_quantity, allowed_payment_methods, allowed_usdt_networks")
      .eq("id", id)
      .maybeSingle(),
    admin.from("product_purchase_restrictions").select("*").eq("product_id", id).maybeSingle(),
    admin
      .from("product_options")
      .select("id, option_name, denomination, denomination_currency, selling_price, minimum_quantity, maximum_quantity, is_active")
      .eq("product_id", id)
      .eq("is_active", true)
      .order("sort_order"),
    admin.from("product_purchase_restriction_exemptions").select("user_id").eq("product_id", id).order("created_at"),
  ]);

  if (productResult.error) throw new Error(`Unable to load product restrictions: ${productResult.error.message}`);
  if (!productResult.data) notFound();
  if (restrictionResult.error) throw new Error(`Unable to load purchase restriction: ${restrictionResult.error.message}`);
  if (optionsResult.error) throw new Error(`Unable to load product options: ${optionsResult.error.message}`);

  const migrationPending = exemptionsResult.error?.code === "PGRST205" || exemptionsResult.error?.code === "42P01";
  if (exemptionsResult.error && !migrationPending) throw new Error("Unable to load customer exemptions. Please retry.");
  const exemptions = await Promise.all((exemptionsResult.data ?? []).map(async exemption => {
    const customer = await admin.auth.admin.getUserById(exemption.user_id);
    if (customer.error) throw new Error("Unable to load exempt customer details.");
    return { userId: exemption.user_id, email: customer.data.user?.email ?? "Email unavailable" };
  }));

  const product = productResult.data;
  const paypalychBlocked = Boolean(await getProductPaypalychRestriction(id));
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
            <ProductSettingsActions slug={product.slug}><Link href="/admin/products" className="h-fit rounded-xl border border-slate-200 px-5 py-3 font-bold">← Product list</Link></ProductSettingsActions>
          </header>

          <div className="mt-8"><ProductEditPageTabs productId={id} current="restrictions" /></div>
          {messages.success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-700">{messages.success}</p>}
          {messages.error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{messages.error}</p>}

          {migrationPending && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Database setup is pending. Apply the purchase restriction migration to enable daily/monthly periods and customer exemptions. Existing limits continue to work.</p>}
          <form action={saveProductRestriction} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <input type="hidden" name="id" value={id} />

            <section>
              <h2 className="text-xl font-black">Minimum order quantity</h2>
              <p className="mt-1 text-sm text-slate-500">The customer must buy at least this quantity of this product. This minimum applies to every denomination.</p>
              <label className="mt-5 block max-w-sm font-bold">
                Minimum quantity
                <input
                  name="minimum_quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={product.minimum_quantity ?? 1}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"
                />
              </label>
            </section>

            <section className="mt-7 border-t border-slate-200 pt-6">
              <h2 className="text-xl font-black">Accepted payment methods</h2>
              <p className="mt-1 text-sm text-slate-500">Only selected methods will be available when this product is in the cart.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {paymentMethods.map(([value, label, description]) => (
                  <label key={value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300">
                    <input type="checkbox" name={`payment_method_${value}`} disabled={value === "PALLY" && paypalychBlocked} defaultChecked={allowedPayments.has(value) && !(value === "PALLY" && paypalychBlocked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-600" />
                    <span><span className="block font-black">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{value === "PALLY" && paypalychBlocked ? "Automatically blocked by your product exclusion list." : description}</span></span>
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

            {(hasInstantDelivery(product) || rule?.is_enabled) ? (
              <section className="mt-7 border-t border-slate-200 pt-6">
                <label className="flex items-center gap-3 font-black"><input type="checkbox" name="is_enabled" defaultChecked={rule?.is_enabled ?? false} className="h-5 w-5 accent-blue-600" />Purchase restriction ON</label><p className="mt-2 text-sm text-slate-500">Counts gift-card face value only for denominations in the selected currency. For example, a 500 USD limit allows 500 USD of USA cards per customer for this product. Selling prices and exchange rates are not used.</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="font-bold">Purchase limit<input name="weekly_limit" type="number" min="1" step="1" defaultValue={rule?.weekly_limit ?? 25000} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
                  <label className="font-bold">Limit currency<select name="limit_currency" defaultValue={rule?.limit_currency ?? optionsResult.data?.find(option => option.is_active)?.denomination_currency ?? "INR"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3">{restrictionCurrencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></label>
                  <label className="font-bold">Identify customer by<select name="identity_mode" defaultValue={rule?.identity_mode ?? "ACCOUNT_EMAIL_IP"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="ACCOUNT_EMAIL_IP">User account + email + IP address</option><option value="ACCOUNT_EMAIL">User account + email</option><option value="IP">IP address only</option></select></label>
                  <label className="font-bold">Reset period<select name="reset_mode" defaultValue={rule?.reset_mode ?? "ROLLING_7_DAYS"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3">{purchaseResetPeriods.map(period => <option key={period.value} value={period.value} disabled={migrationPending && period.value !== "ROLLING_7_DAYS"}>{period.label}</option>)}{rule?.reset_mode === "CALENDAR_WEEK" && <option value="CALENDAR_WEEK">Calendar week (existing setting)</option>}</select></label>
                  <label className="font-bold sm:col-span-2">Customer notification<textarea name="notification_message" rows={3} maxLength={500} defaultValue={rule?.notification_message === "Weekly purchase limit reached. Please try again after your limit resets." ? purchaseLimitMessage : rule?.notification_message || purchaseLimitMessage} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>
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

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Customer exemptions</h2>
            <p className="mt-2 text-sm text-slate-500">Remove this product&apos;s purchase limit for a registered customer. The customer must sign in to use the exemption. Quantity limits and accepted payment methods still apply.</p>
            <form action={exemptCustomerFromPurchaseRestriction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="product_id" value={id} />
              <label className="min-w-0 flex-1 text-sm font-bold">Registered customer email
                <input name="customer_email" type="email" disabled={migrationPending} required maxLength={254} placeholder="customer@example.com" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" />
              </label>
              <button disabled={migrationPending} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">Remove restriction for customer</button>
            </form>
            <ul className="mt-5 divide-y divide-slate-200">
              {exemptions.map(customer => <li key={customer.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="break-all font-bold">{customer.email}</p><p className="text-sm text-emerald-700">Purchase limit does not apply</p></div>
                <form action={restoreCustomerPurchaseRestriction}>
                  <input type="hidden" name="product_id" value={id} /><input type="hidden" name="user_id" value={customer.userId} />
                  <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Restore restriction</button>
                </form>
              </li>)}
            </ul>
            {!exemptions.length && <p className="mt-3 text-sm text-slate-500">No customers are exempt from this product&apos;s purchase limit.</p>}
          </section>

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
