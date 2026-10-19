import { Fragment } from "react";
import { redirect } from "next/navigation";
import Link from "@/components/NavigationLink";
import { ADMIN_ORDER_PAGE_SIZE, loadAdminOrders } from "@/lib/admin-orders-query";
import type { AdminOrder } from "@/lib/admin-order-display";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import AdminOrdersAutoRefresh from "./AdminOrdersAutoRefresh";
import AdminOrdersList from "./AdminOrdersList";
import styles from "./Orders.module.css";

export const dynamic = "force-dynamic";

type AdminOrdersPageProps = {
  searchParams: Promise<{ error?: string; success?: string; page?: string; q?: string; status?: string }>;
};

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const { error: actionError, success, page: requestedPage, q: requestedQuery, status: requestedStatus } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const adminResult = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (!adminResult.data) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }
  const admin = createAdminClient();
  const result = await loadAdminOrders(admin, { status: requestedStatus, query: requestedQuery, page: requestedPage });
  const { query, status: activeStatus, page, totalPages, matchedCount, counts } = result;
  const visibleOrders = result.orders as unknown as AdminOrder[];
  const customerIdByEmail = new Map<string, string>();
  for (const order of visibleOrders) {
    if (order.customer_id) customerIdByEmail.set(order.customer_email.trim().toLowerCase(), order.customer_id);
  }
  const missingEmails = [...new Set(visibleOrders.filter(order => !order.customer_id).map(order => order.customer_email.trim().toLowerCase()))];
  if (missingEmails.length) {
    const profiles = await admin.from("profiles").select("id,email").in("email", missingEmails);
    for (const profile of profiles.data ?? []) {
      if (profile.email) customerIdByEmail.set(profile.email.trim().toLowerCase(), profile.id);
    }
  }
  const tabs = [
    { key: "all", label: "All orders", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "review", label: "Payment review", count: counts.review },
    { key: "processing", label: "Processing", count: counts.processing },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "trash", label: "Trash", count: counts.trash },
  ];
  const activeLabel = tabs.find(tab => tab.key === activeStatus)!.label;
  const heading = activeStatus === "all" || activeStatus === "trash" ? activeLabel : activeLabel + " orders";
  const hrefFor = (status: string, pageNumber = 1) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (query) params.set("q", query);
    if (pageNumber > 1) params.set("page", String(pageNumber));
    return "/admin/orders" + (params.size ? "?" + params.toString() : "");
  };
  const pages = [...new Set([1, totalPages, ...Array.from({ length: 3 }, (_, i) => page + i - 1)])]
    .filter(number => number >= 1 && number <= totalPages).sort((a, b) => a - b);

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <AdminOrdersAutoRefresh />
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
      <AdminSidebar orderCount={counts.processing} />
      <main className={"min-w-0 flex-1 p-5 sm:p-8 " + styles.page}>
        <header>
          <h1 className="text-3xl font-black">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Payments, customers and delivery.</p>
        </header>
        {success && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</div>}
        {actionError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{actionError}</div>}
        <form method="get" action="/admin/orders" className={styles.search} role="search">
          {activeStatus !== "all" && <input type="hidden" name="status" value={activeStatus} />}
          <input aria-label="Search order number or customer email" type="search" maxLength={200} name="q" defaultValue={requestedQuery ?? ""} placeholder="Order number or customer email" />
          <button type="submit">Search</button>
          {query && <Link prefetch={false} href={activeStatus === "all" ? "/admin/orders" : "/admin/orders?status=" + activeStatus}>Clear</Link>}
        </form>
        <nav className={styles.tabs} aria-label="Order status filters">
          {tabs.map(tab => <Link prefetch={false} key={tab.key} href={hrefFor(tab.key)} aria-current={activeStatus === tab.key ? "page" : undefined}>
            {tab.label} <span>{tab.count.toLocaleString("en-IN")}</span>
          </Link>)}
        </nav>
        <section aria-label={heading}>
          <div className={styles.listHeading}>
            <h2>{heading} ({matchedCount.toLocaleString("en-IN")})</h2>
            <p>{activeStatus === "trash" ? "Permanently deleted after 30 days." : "Newest first · Updates every 30s · IST"}</p>
          </div>
          {matchedCount === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {query ? "No orders found for “" + requestedQuery + "”." : counts.all + counts.trash === 0 ? "No orders are available." : "No orders in this status."}
          </div> : <AdminOrdersList orders={visibleOrders} customerIds={customerIdByEmail} />}
          <footer className={styles.footer}>
            <span>{matchedCount === 0 ? "0 orders" : ((page - 1) * ADMIN_ORDER_PAGE_SIZE + 1).toLocaleString("en-IN") + "–" + Math.min(page * ADMIN_ORDER_PAGE_SIZE, matchedCount).toLocaleString("en-IN") + " of " + matchedCount.toLocaleString("en-IN") + " orders"}</span>
            <nav className={styles.pagination} aria-label="Order pages">
              {page > 1 && <Link prefetch={false} href={hrefFor(activeStatus, page - 1)} aria-label="Previous page">Previous</Link>}
              {pages.map((number, index) => <Fragment key={number}>
                {index > 0 && number - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
                <Link prefetch={false} href={hrefFor(activeStatus, number)} aria-label={"Page " + number} aria-current={number === page ? "page" : undefined}>{number}</Link>
              </Fragment>)}
              {page < totalPages && <Link prefetch={false} href={hrefFor(activeStatus, page + 1)} aria-label="Next page">Next</Link>}
            </nav>
          </footer>
        </section>
      </main>
    </div>
  </div>;
}
