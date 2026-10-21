import { Suspense } from "react";
import Link from "@/components/NavigationLink";
import { redirect } from "next/navigation";
import { adminLogout, sendTestEmail } from "./actions";
import AdminOrderLink from "./AdminOrderLink";
import DashboardRetry from "./DashboardRetry";
import InstallAdminAppButton from "@/components/InstallAdminAppButton";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadDashboardSummary,
  loadRecentDashboardOrders,
  type DashboardResult,
  type DashboardSummary,
  type RecentDashboardOrder,
} from "@/lib/admin-dashboard";

export const dynamic = "force-dynamic";

type AdminDashboardProps = {
  searchParams: Promise<{ emailSuccess?: string; emailError?: string }>;
};

function formatMoney(amount: number | string, currency = "USD") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Number(amount));
}

function statusClass(status: string) {
  switch (status) {
    case "DELIVERED": return "bg-emerald-100 text-emerald-700";
    case "PAID":
    case "PROCESSING": return "bg-blue-100 text-blue-700";
    case "PAYMENT_REVIEW": return "bg-amber-100 text-amber-700";
    case "CANCELLED":
    case "REFUNDED": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

const cardDetails = [
  { key: "revenue", label: "Revenue today", description: "Verified sales today", href: "/admin/orders" },
  { key: "orders", label: "Orders", description: "All customer orders", href: "/admin/orders" },
  { key: "reviews", label: "Needs review", description: "Payment proofs", href: "/admin/payments" },
  { key: "processing", label: "Processing orders", description: "Waiting for delivery", href: "/admin/orders?status=processing" },
] as const;

function SummaryCards({ data }: { data?: DashboardSummary }) {
  return (
    <section aria-label="Store totals" aria-busy={!data} className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {!data && <span className="sr-only">Updating overview…</span>}
      {cardDetails.map((card) => (
        <Link key={card.key} href={card.href} className="rounded-2xl bg-slate-100 p-5 transition hover:bg-blue-50 hover:shadow-md">
          <p className="text-sm text-slate-500">{card.label}</p>
          <p className="mt-2 text-3xl font-black">{data ? (card.key === "revenue" ? formatMoney(data.revenue) : data[card.key]) : "—"}</p>
          <p className="mt-1 text-xs text-slate-500">{card.description}</p>
        </Link>
      ))}
    </section>
  );
}

function ReadError({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>{message}</p><DashboardRetry />
    </div>
  );
}

async function Summary({ result }: { result: Promise<DashboardResult<DashboardSummary>> }) {
  const value = await result;
  if (value.error !== undefined) return <ReadError message={value.error} />;
  return (
    <>
      {value.data.processing > 0 && (
        <Link href="/admin/orders?status=processing" className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-amber-400 bg-amber-50 px-5 py-4 font-bold text-amber-900 shadow-sm">
          <span>⚠ {value.data.processing} processing order{value.data.processing === 1 ? "" : "s"} waiting for delivery</span>
          <span className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white">View orders</span>
        </Link>
      )}
      <SummaryCards data={value.data} />
    </>
  );
}

function RecentOrdersPending() {
  return <p role="status" className="mt-4 rounded-2xl border border-slate-200 px-5 py-6 text-sm text-slate-500">Updating recent orders…</p>;
}

function RecentOrdersHeading() {
  return <div className="flex items-center justify-between gap-4">
    <h2 className="text-xl font-black">Recent orders</h2>
    <Link href="/admin/orders" className="text-sm font-bold text-blue-600 hover:text-blue-500">View all</Link>
  </div>;
}

async function RecentOrders({ result }: { result: Promise<DashboardResult<RecentDashboardOrder[]>> }) {
  const value = await result;
  if (value.error !== undefined) return <ReadError message={value.error} />;
  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200">
      <div className="w-full max-w-full overflow-x-auto" aria-label="Slide recent orders left or right">
        <table className="w-full min-w-[650px] text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
            <tr>{["Order", "Customer", "Amount", "Status"].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {value.data.map((order) => (
              <tr key={order.id}>
                <td className="px-5 py-4"><AdminOrderLink orderId={order.id} orderNumber={order.order_number} /></td>
                <td className="px-5 py-4">{order.customer_name || "Customer"}</td>
                <td className="px-5 py-4 font-bold">{formatMoney(order.total, order.currency)}</td>
                <td className="px-5 py-4"><span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " + statusClass(order.status)}>
                  {order.status === "DELIVERED" ? "COMPLETED" : order.status.replaceAll("_", " ")}
                </span></td>
              </tr>
            ))}
            {value.data.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">No orders available.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <aside>
      <h2 className="text-xl font-black">Quick actions</h2>
      <div className="mt-4 grid gap-3">
        <form action={sendTestEmail} className="rounded-xl border border-slate-200 p-3">
          <label htmlFor="testEmailRecipient" className="text-sm font-black">Test customer email</label>
          <input id="testEmailRecipient" name="recipient" type="email" required placeholder="your-email@example.com"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <button type="submit" className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white transition hover:bg-blue-500">Send test email</button>
        </form>
        {[
          { href: "/admin/products", label: "+ Add product" },
          { href: "/admin/payments", label: "✓ Verify payments" },
          { href: "/admin/orders", label: "▣ Manage orders" },
        ].map((action) => <Link key={action.href} href={action.href} className="rounded-xl border border-slate-200 px-4 py-3 font-bold transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600">{action.label}</Link>)}
      </div>
    </aside>
  );
}

function DashboardPending() {
  return <>
    <div className="xl:col-span-2"><SummaryCards /></div>
    <section className="mt-8 min-w-0 xl:col-start-1 xl:row-start-2"><RecentOrdersHeading /><RecentOrdersPending /></section>
  </>;
}

async function DashboardContent({ searchParams }: AdminDashboardProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const adminResult = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (adminResult.error || !adminResult.data) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }

  // These privileged queries must stay below the session and admin checks.
  // Stream each section independently; no private dashboard data is cached.
  const db = createAdminClient();
  const summary = loadDashboardSummary(db);
  const recentOrders = loadRecentDashboardOrders(db);
  const { emailSuccess, emailError } = await searchParams;
  return <>
    <div className="xl:col-span-2">
      {emailSuccess && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{emailSuccess}</p>}
      {emailError && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">Email test failed: {emailError}</p>}
      <Suspense fallback={<SummaryCards />}><Summary result={summary} /></Suspense>
    </div>
    <section className="mt-8 min-w-0 xl:col-start-1 xl:row-start-2"><RecentOrdersHeading />
      <Suspense fallback={<RecentOrdersPending />}><RecentOrders result={recentOrders} /></Suspense>
    </section>
    <footer className="order-last mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500 xl:col-span-2">Signed in as {user.email} · {adminResult.data.role}</footer>
  </>;
}

export default function AdminDashboard(props: AdminDashboardProps) {
  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] bg-white p-5 text-slate-900 sm:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black">Store overview</h1>
          <p className="mt-1 text-sm text-slate-500">Today&apos;s activity and items needing attention</p>
        </div>
        <div className="flex flex-wrap gap-3"><InstallAdminAppButton />
          <form action={adminLogout}><button type="submit" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">Sign out</button></form>
        </div>
      </header>
      <div className="grid gap-x-8 xl:grid-cols-[minmax(0,1fr)_260px]">
        <Suspense fallback={<DashboardPending />}><DashboardContent {...props} /></Suspense>
        <div className="mt-8 min-w-0 xl:col-start-2 xl:row-start-2"><QuickActions /></div>
      </div>
    </main>
  );
}
