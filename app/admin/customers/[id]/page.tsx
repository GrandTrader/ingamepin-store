import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../AdminSidebar";
import CustomerDiscountManager from "./CustomerDiscountManager";
import { setCustomerWalletAccess } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
};

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function date(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusClass(status: string) {
  if (["DELIVERED", "PAID"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["CANCELLED", "REFUNDED", "REJECTED"].includes(status)) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export default async function AdminCustomerPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const adminAccess = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminAccess.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const userResult = await admin.auth.admin.getUserById(id);
  if (userResult.error || !userResult.data.user) notFound();

  const customer = userResult.data.user;
  const email = (customer.email ?? "").trim().toLowerCase();
  const [walletResult, transactionsResult, ordersResult, discountsResult, productsResult, loginResult] = await Promise.all([
    admin.from("customer_wallets").select("balance,currency").eq("user_id", id).maybeSingle(),
    admin.from("wallet_transactions").select("id,transaction_type,amount,balance_before,balance_after,description,reference_id,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
    admin.from("orders").select("id,order_number,status,total,currency,created_at").ilike("customer_email", email).order("created_at", { ascending: false }).limit(100),
    admin.from("customer_product_discounts").select("product_id,discount_percent").eq("user_id", id).eq("is_active", true),
    admin.from("products").select("id,name,product_type").eq("status", "ACTIVE").order("name"),
    admin.from("customer_login_activity").select("current_country_code,previous_country_code,current_login_at").eq("user_id", id).maybeSingle(),
  ]);

  const queryError = transactionsResult.error || ordersResult.error || discountsResult.error || productsResult.error;
  if (queryError) throw new Error(`Unable to load customer activity: ${queryError.message}`);

  const wallet = walletResult.data;
  const orders = ordersResult.data ?? [];
  const transactions = transactionsResult.data ?? [];
  const discounts = discountsResult.data ?? [];
  const products = productsResult.data ?? [];
  const paidStatuses = new Set(["PAID", "PROCESSING", "DELIVERED"]);
  const totalSpent = orders.reduce((sum, order) => sum + (paidStatuses.has(order.status) ? Number(order.total) : 0), 0);
  const metadata = customer.user_metadata ?? {};
  const name = String(metadata.full_name ?? metadata.name ?? email.split("@")[0] ?? "Customer");
  const phone = String(metadata.phone ?? customer.phone ?? "").trim();
  const walletEnabled = customer.app_metadata?.wallet_disabled !== true;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 md:flex">
      <AdminSidebar />
      <main className="min-w-0 flex-1 px-4 py-7 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Link href="/admin/customers" className="text-sm font-bold text-cyan-600 hover:text-cyan-700">← Back to customers</Link>

          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-600">Customer profile</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">{name}</h1>
              <p className="mt-1 text-sm text-slate-500">{email}</p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${customer.email_confirmed_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {customer.email_confirmed_at ? "Verified" : "Unverified"}
            </span>
          </div>

          {messages.success && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{messages.success}</div>}
          {messages.error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{messages.error}</div>}

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Wallet balance" value={money(Number(wallet?.balance ?? 0), wallet?.currency ?? "USD")} />
            <Summary label="Total orders" value={String(orders.length)} />
            <Summary label="Total spent" value={money(totalSpent)} />
            <Summary label="Active discounts" value={String(discounts.length)} />
          </div>

          <section className={`mt-6 rounded-2xl border p-5 shadow-sm ${walletEnabled ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Customer wallet access</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {walletEnabled
                    ? "Enabled: customer can add money and pay using wallet balance."
                    : "Disabled: wallet top-ups and wallet payments are blocked."}
                </p>
              </div>
              <form action={setCustomerWalletAccess}>
                <input type="hidden" name="customer_id" value={id} />
                <input type="hidden" name="enabled" value={walletEnabled ? "false" : "true"} />
                <button className={`rounded-xl px-5 py-3 font-black text-white ${walletEnabled ? "bg-red-600" : "bg-emerald-600"}`}>
                  {walletEnabled ? "Disable wallet" : "Enable wallet"}
                </button>
              </form>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Profile information</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Detail label="Full name" value={name} />
              <Detail label="Email" value={email || "—"} />
              <Detail label="Mobile" value={phone || "—"} />
              <Detail label="Joined" value={date(customer.created_at)} />
              <Detail label="Last sign-in" value={date(customer.last_sign_in_at)} />
              <Detail label="Current country" value={loginResult.data?.current_country_code ?? "—"} />
              <Detail label="Previous country" value={loginResult.data?.previous_country_code ?? "—"} />
              <Detail label="Customer ID" value={customer.id} />
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Wallet activity</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[850px] w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Amount</th><th className="p-3">Before</th><th className="p-3">After</th><th className="p-3">Activity</th><th className="p-3">Reference</th></tr></thead>
                <tbody>
                  {transactions.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="p-3">{date(item.created_at)}</td><td className="p-3 font-bold">{item.transaction_type}</td><td className="p-3 font-black">{money(Number(item.amount), wallet?.currency ?? "USD")}</td><td className="p-3">{money(Number(item.balance_before), wallet?.currency ?? "USD")}</td><td className="p-3">{money(Number(item.balance_after), wallet?.currency ?? "USD")}</td><td className="p-3">{item.description}</td><td className="p-3 text-xs">{item.reference_id ?? "—"}</td></tr>)}
                  {transactions.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No wallet activity yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Order activity</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[700px] w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Receipt</th></tr></thead>
                <tbody>
                  {orders.map((order) => <tr key={order.id} className="border-b border-slate-100"><td className="p-3 font-black">{order.order_number}</td><td className="p-3">{date(order.created_at)}</td><td className="p-3 font-black">{money(Number(order.total), order.currency)}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(order.status)}`}>{order.status.replaceAll("_", " ")}</span></td><td className="p-3"><Link href={`/admin/orders/${order.id}/receipt`} className="font-bold text-cyan-600">View</Link></td></tr>)}
                  {orders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No orders found for this customer.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-6">
            <CustomerDiscountManager
              customerId={id}
              products={products.map((product) => ({ id: product.id, name: product.name, productType: product.product_type }))}
              discounts={discounts.map((discount) => ({ productId: discount.product_id, discountPercent: Number(discount.discount_percent) }))}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 break-words text-3xl font-black">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-all text-sm font-bold text-slate-800">{value}</p></div>;
}
