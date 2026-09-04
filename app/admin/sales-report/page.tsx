import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "../AdminSidebar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReportOrder = { id: string; total: number | string; currency: string; status: string; created_at: string; order_items: Array<{ product_name: string; quantity: number }> };
type Props = { searchParams: Promise<{ range?: string; currency?: string }> };
const paidStatuses = new Set(["PAID", "PROCESSING", "DELIVERED"]);

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(value));
}

export default async function SalesReportPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = ["7", "30", "90"].includes(params.range ?? "") ? Number(params.range) : 30;
  const selectedCurrency = (params.currency || "USD").toUpperCase();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const adminResult = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (!adminResult.data) { await supabase.auth.signOut(); redirect("/admin/login?error=Access denied"); }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (range - 1));
  const { data, error } = await supabase.from("orders").select("id,total,currency,status,created_at,order_items(product_name,quantity)").gte("created_at", start.toISOString()).order("created_at", { ascending: true });
  const allOrders = (data ?? []) as ReportOrder[];
  const currencies = Array.from(new Set(["USD", ...allOrders.map(order => order.currency || "USD")])).sort();
  const orders = allOrders.filter(order => (order.currency || "USD").toUpperCase() === selectedCurrency);
  const paidOrders = orders.filter(order => paidStatuses.has(order.status));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const average = paidOrders.length ? revenue / paidOrders.length : 0;
  const completed = orders.filter(order => order.status === "DELIVERED").length;
  const conversion = orders.length ? (paidOrders.length / orders.length) * 100 : 0;

  const days = Array.from({ length: range }, (_, index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const matches = paidOrders.filter(order => order.created_at.slice(0, 10) === key);
    return { key, label: shortDate(date.toISOString()), orders: matches.length, revenue: matches.reduce((sum, order) => sum + Number(order.total || 0), 0) };
  });
  const visibleDays = range === 90 ? days.filter((_, index) => index % 3 === 0) : days;
  const maxRevenue = Math.max(...visibleDays.map(day => day.revenue), 1);
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  for (const order of paidOrders) {
    const units = order.order_items.reduce((sum, item) => sum + Math.max(item.quantity, 1), 0) || 1;
    for (const item of order.order_items) {
      const current = productMap.get(item.product_name) ?? { quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += Number(order.total || 0) * (item.quantity / units);
      productMap.set(item.product_name, current);
    }
  }
  const products = Array.from(productMap, ([name, values]) => ({ name, ...values })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const attentionCount = orders.filter(order => ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING"].includes(order.status)).length;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
      <AdminSidebar orderCount={attentionCount}/>
      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">Performance</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Sales report</h1><p className="mt-2 text-sm text-slate-500">Revenue and order performance from your verified sales.</p></div>
          <form className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <label className="sr-only" htmlFor="range">Date range</label><select id="range" name="range" defaultValue={String(range)} className="rounded-xl border-0 bg-slate-100 px-4 py-2.5 text-sm font-bold outline-none ring-blue-500 focus:ring-2"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
            <label className="sr-only" htmlFor="currency">Currency</label><select id="currency" name="currency" defaultValue={selectedCurrency} className="rounded-xl border-0 bg-slate-100 px-4 py-2.5 text-sm font-bold outline-none ring-blue-500 focus:ring-2">{currencies.map(currency => <option key={currency}>{currency}</option>)}</select>
            <button className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white transition hover:bg-blue-600">Apply</button>
          </form>
        </header>

        {error ? <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">Unable to load sales: {error.message}</div> : <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">{[
            { label: "Gross revenue", value: money(revenue, selectedCurrency), note: `${paidOrders.length} paid orders`, color: "from-blue-600 to-cyan-500" },
            { label: "Average order", value: money(average, selectedCurrency), note: "Per verified order", color: "from-violet-600 to-fuchsia-500" },
            { label: "Completed", value: String(completed), note: `${orders.length} total orders`, color: "from-emerald-600 to-teal-500" },
            { label: "Payment success", value: `${conversion.toFixed(1)}%`, note: "Paid or processing", color: "from-amber-500 to-orange-500" },
          ].map(card => <article key={card.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.color}`}/><p className="text-sm font-bold text-slate-500">{card.label}</p><p className="mt-3 text-3xl font-black tracking-tight">{card.value}</p><p className="mt-2 text-xs font-medium text-slate-400">{card.note}</p></article>)}</section>

          <section className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.75fr)]">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">Revenue trend</h2><p className="mt-1 text-sm text-slate-500">Daily verified sales</p></div><div className="flex items-center gap-2 text-sm font-bold text-slate-500"><i className="h-2.5 w-2.5 rounded-full bg-blue-500"/>Revenue</div></div>
              <div className="mt-8 overflow-x-auto pb-2"><div className="flex h-72 min-w-[620px] items-end gap-2 border-b border-slate-200 pl-1">{visibleDays.map((day, index) => <div key={day.key} className="group flex h-full min-w-0 flex-1 flex-col justify-end"><div className="pointer-events-none mb-2 hidden rounded-lg bg-slate-950 px-2 py-1 text-center text-xs font-bold text-white group-hover:block">{money(day.revenue, selectedCurrency)} · {day.orders}</div><div className="mx-auto w-full max-w-8 rounded-t-md bg-gradient-to-t from-blue-600 to-cyan-400 transition hover:from-blue-700 hover:to-cyan-500" style={{ height: `${Math.max(day.revenue ? (day.revenue / maxRevenue) * 82 : 2, 2)}%` }}/>{(visibleDays.length <= 10 || index % Math.ceil(visibleDays.length / 8) === 0) && <span className="mt-3 block -rotate-45 whitespace-nowrap text-[11px] font-bold text-slate-400">{day.label}</span>}</div>)}</div></div>
            </article>
            <article className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-300/40 sm:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Sales snapshot</p><p className="mt-4 text-4xl font-black">{money(revenue, selectedCurrency)}</p><p className="mt-2 text-sm text-slate-400">in the last {range} days</p>
              <div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-4"><strong className="text-2xl">{paidOrders.length}</strong><span className="mt-1 block text-xs text-slate-400">Paid orders</span></div><div className="rounded-2xl bg-white/10 p-4"><strong className="text-2xl">{orders.length}</strong><span className="mt-1 block text-xs text-slate-400">All orders</span></div></div>
              <Link href="/admin/orders" className="mt-6 flex items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-sm font-black transition hover:bg-blue-500"><span>View all orders</span><span aria-hidden="true">→</span></Link>
            </article>
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black">Top products</h2><p className="mt-1 text-sm text-slate-500">Ranked by verified revenue</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{selectedCurrency}</span></div>
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><tr><th className="pb-3">Product</th><th className="pb-3">Units sold</th><th className="pb-3 text-right">Revenue</th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product, index) => <tr key={product.name}><td className="py-4 font-bold"><span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span>{product.name}</td><td className="py-4 text-slate-600">{product.quantity}</td><td className="py-4 text-right font-black">{money(product.revenue, selectedCurrency)}</td></tr>)}{!products.length && <tr><td colSpan={3} className="py-12 text-center text-slate-500">No verified sales in this period.</td></tr>}</tbody></table></div>
          </section>
        </>}
      </main>
    </div>
  </div>;
}
