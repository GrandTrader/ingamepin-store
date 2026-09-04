import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "../AdminSidebar";
import { createClient } from "@/lib/supabase/server";
import ReportFilters from "./ReportFilters";

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
  const periodMode = ["daily", "weekly", "monthly"].includes(params.range ?? "") ? params.range! : "daily";
  const selectedCurrency = (params.currency || "USD").toUpperCase();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const adminResult = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (!adminResult.data) { await supabase.auth.signOut(); redirect("/admin/login?error=Access denied"); }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  if (periodMode === "monthly") {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 11);
  } else {
    start.setUTCDate(start.getUTCDate() - (periodMode === "weekly" ? 55 : 6));
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayCount = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
  const { data, error } = await supabase.from("orders").select("id,total,currency,status,created_at,order_items(product_name,quantity)").gte("created_at", start.toISOString()).order("created_at", { ascending: true });
  const allOrders = (data ?? []) as ReportOrder[];
  const currencies = Array.from(new Set(["USD", ...allOrders.map(order => order.currency || "USD")])).sort();
  const orders = allOrders.filter(order => (order.currency || "USD").toUpperCase() === selectedCurrency);
  const paidOrders = orders.filter(order => paidStatuses.has(order.status));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const average = paidOrders.length ? revenue / paidOrders.length : 0;
  const completed = orders.filter(order => order.status === "DELIVERED").length;
  const conversion = orders.length ? (paidOrders.length / orders.length) * 100 : 0;
  const awaitingPayment = orders.filter(order => order.status === "PENDING_PAYMENT").length;
  const needsDelivery = orders.filter(order => ["PAID", "PROCESSING"].includes(order.status)).length;
  const cancelled = orders.filter(order => order.status === "CANCELLED").length;

  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const matches = paidOrders.filter(order => order.created_at.slice(0, 10) === key);
    return { key, label: shortDate(date.toISOString()), orders: matches.length, revenue: matches.reduce((sum, order) => sum + Number(order.total || 0), 0) };
  });
  const chartPeriods = periodMode === "monthly"
    ? Array.from(days.reduce((periods, day) => {
        const monthKey = day.key.slice(0, 7);
        const current = periods.get(monthKey) ?? {
          key: monthKey,
          label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`)),
          orders: 0,
          revenue: 0,
        };
        current.orders += day.orders;
        current.revenue += day.revenue;
        periods.set(monthKey, current);
        return periods;
      }, new Map<string, { key: string; label: string; orders: number; revenue: number }>()).values())
    : periodMode === "weekly"
      ? Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => {
          const periodDays = days.slice(index * 7, (index + 1) * 7);
          const firstDay = periodDays[0];
          const lastDay = periodDays[periodDays.length - 1];
          return { key: firstDay.key, label: `${firstDay.label} – ${lastDay.label}`, orders: periodDays.reduce((sum, day) => sum + day.orders, 0), revenue: periodDays.reduce((sum, day) => sum + day.revenue, 0) };
        })
      : days;
  const maxRevenue = Math.max(...chartPeriods.map(period => period.revenue), 1);
  const chartPeriodName = periodMode === "daily" ? "day" : periodMode === "weekly" ? "week" : "month";
  const reportPeriodLabel = periodMode === "daily" ? "last 7 days" : periodMode === "weekly" ? "last 8 weeks" : "last 12 months";
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
  const processingOrderCount = orders.filter(order => order.status === "PROCESSING").length;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
      <AdminSidebar orderCount={processingOrderCount}/>
      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">Sales overview</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Sales report</h1><p className="mt-2 text-sm text-slate-500">See how much you sold, how many orders were paid, and what still needs attention.</p></div>
          <ReportFilters periodMode={periodMode} selectedCurrency={selectedCurrency} currencies={currencies} />
        </header>

        {error ? <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">Unable to load sales: {error.message}</div> : <>
          <section className="mt-7 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-slate-800">
            <h2 className="font-black text-blue-900">Summary for the {reportPeriodLabel}</h2>
            <p className="mt-2 leading-7">You received <strong>{orders.length} {selectedCurrency} orders</strong>. <strong>{paidOrders.length}</strong> were successfully paid and generated <strong>{money(revenue, selectedCurrency)}</strong>. <strong>{completed}</strong> orders were delivered.</p>
          </section>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">{[
            { label: "Revenue from paid orders", value: money(revenue, selectedCurrency), note: `${paidOrders.length} orders are paid, processing, or delivered`, color: "from-blue-600 to-cyan-500" },
            { label: "Average paid order", value: money(average, selectedCurrency), note: "Revenue divided by paid orders", color: "from-violet-600 to-fuchsia-500" },
            { label: "Delivered orders", value: String(completed), note: `Out of ${orders.length} total orders`, color: "from-emerald-600 to-teal-500" },
            { label: "Orders successfully paid", value: `${conversion.toFixed(1)}%`, note: `${paidOrders.length} of ${orders.length} total orders`, color: "from-amber-500 to-orange-500" },
          ].map(card => <article key={card.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.color}`}/><p className="text-sm font-bold text-slate-500">{card.label}</p><p className="mt-3 text-3xl font-black tracking-tight">{card.value}</p><p className="mt-2 text-xs font-medium text-slate-400">{card.note}</p></article>)}</section>

          <section className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.75fr)]">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">Paid revenue by {chartPeriodName}</h2><p className="mt-1 text-sm text-slate-500">Each column shows the paid revenue and number of paid orders for that period.</p></div><div className="flex items-center gap-2 text-sm font-bold text-slate-500"><i className="h-2.5 w-2.5 rounded-full bg-blue-500"/>Paid revenue</div></div>
              <div className="mt-7 grid min-w-0 gap-2" style={{ gridTemplateColumns: `repeat(${chartPeriods.length}, minmax(0, 1fr))` }}>
                {chartPeriods.map(period => <div key={period.key} className="flex min-w-0 flex-col">
                  <div className="mb-2 text-center">
                    <p className="truncate text-xs font-black text-slate-800" title={money(period.revenue, selectedCurrency)}>{money(period.revenue, selectedCurrency)}</p>
                    <p className="mt-1 text-[10px] font-bold leading-4 text-slate-500">{period.orders} paid</p>
                  </div>
                  <div className="flex h-44 min-w-0 items-end justify-center rounded-xl bg-slate-100 px-1 pt-3">
                    <div className="w-full max-w-7 rounded-t-md bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${Math.max(period.revenue ? (period.revenue / maxRevenue) * 100 : 3, 3)}%` }} />
                  </div>
                  <p className="mt-3 break-words text-center text-[10px] font-black leading-4 text-slate-600">{period.label}</p>
                </div>)}
              </div>
            </article>
            <article className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-300/40 sm:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Order status breakdown</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">Use this section to see what needs action.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 p-4"><strong className="text-2xl">{awaitingPayment}</strong><span className="mt-1 block text-xs text-slate-300">Waiting for payment</span></div>
                <div className="rounded-2xl bg-white/10 p-4"><strong className="text-2xl">{needsDelivery}</strong><span className="mt-1 block text-xs text-slate-300">Paid; needs delivery</span></div>
                <div className="rounded-2xl bg-white/10 p-4"><strong className="text-2xl">{completed}</strong><span className="mt-1 block text-xs text-slate-300">Delivered</span></div>
                <div className="rounded-2xl bg-white/10 p-4"><strong className="text-2xl">{cancelled}</strong><span className="mt-1 block text-xs text-slate-300">Cancelled</span></div>
              </div>
              <Link href="/admin/orders" className="mt-6 flex items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-sm font-black transition hover:bg-blue-500"><span>View all orders</span><span aria-hidden="true">→</span></Link>
            </article>
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black">Best-selling products</h2><p className="mt-1 text-sm text-slate-500">The five products that generated the most paid revenue</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">Currency: {selectedCurrency}</span></div>
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><tr><th className="pb-3">Rank and product</th><th className="pb-3">Quantity sold</th><th className="pb-3 text-right">Estimated revenue</th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product, index) => <tr key={product.name}><td className="py-4 font-bold"><span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span>{product.name}</td><td className="py-4 text-slate-600">{product.quantity}</td><td className="py-4 text-right font-black">{money(product.revenue, selectedCurrency)}</td></tr>)}{!products.length && <tr><td colSpan={3} className="py-12 text-center text-slate-500">No paid sales in this period.</td></tr>}</tbody></table></div>
          </section>
        </>}
      </main>
    </div>
  </div>;
}
