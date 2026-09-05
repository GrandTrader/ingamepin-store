import { redirect } from "next/navigation";

import Link from "next/link";
import AdminOrderLink from "../AdminOrderLink";
import AdminSidebar from "../AdminSidebar";
import AdminOrdersAutoRefresh from "./AdminOrdersAutoRefresh";
import AdminOrdersTableScroller from "./AdminOrdersTableScroller";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string;
  customer_phone: string | null;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  order_items: OrderItem[];
};

type OrderItem = {
  id: string;
  product_name: string;
  option_name: string | null;
  denomination: number | null;
  platform: string | null;
  fulfillment_mode: string | null;
  player_id: string | null;
  customer_information: Array<{ fieldId: string; label: string; value: string }>;
  quantity: number;
  affiliate_commission_percent: number | string;
};

type AdminOrdersPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    page?: string;
    q?: string;
    status?: string;
  }>;
};

function formatMoney(
  amount: number | string,
  currency: string,
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "USD",
  }).format(Number(amount));
}

function formatDate(date: string | null) {
  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function statusStyle(status: string) {
  switch (status) {
    case "DELIVERED":
      return "bg-emerald-100 text-emerald-700";

    case "PAID":
    case "PROCESSING":
      return "bg-blue-100 text-blue-700";

    case "PAYMENT_REVIEW":
      return "bg-amber-100 text-amber-700";

    case "CANCELLED":
    case "REFUNDED":
      return "bg-red-100 text-red-700";

    case "TRASHED":
      return "bg-slate-800 text-white";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const {
    error: actionError,
    success,
    page: requestedPage,
    q: requestedQuery,
    status: requestedStatus,
  } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
        id,
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        total,
        currency,
        status,
        created_at,
        paid_at,
        delivered_at,
        order_items (
          id,
          product_name,
          option_name,
          denomination,
          platform,
          fulfillment_mode,
          player_id,
          customer_information,
          quantity,
          affiliate_commission_percent
        )
      `,
    )
    .order("created_at", {
      ascending: false,
    });

  const orders = (data ?? []) as Order[];
  const authUsersResult = await createAdminClient().auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const customerIdByEmail = new Map(
    (authUsersResult.data?.users ?? [])
      .filter((customer) => customer.email)
      .map((customer) => [customer.email!.trim().toLowerCase(), customer.id]),
  );
  const query = (requestedQuery ?? "").trim().toLowerCase();
  const activeStatus = ["pending", "review", "processing", "completed", "trash"].includes(
    requestedStatus ?? "",
  )
    ? requestedStatus!
    : "all";
  const statusMatches = (order: Order) => {
    switch (activeStatus) {
      case "pending":
        return order.status === "PENDING_PAYMENT";
      case "review":
        return order.status === "PAYMENT_REVIEW";
      case "processing":
        return order.status === "PAID" || order.status === "PROCESSING";
      case "completed":
        return order.status === "DELIVERED";
      case "trash":
        return order.status === "TRASHED";
      default:
        return order.status !== "TRASHED";
    }
  };
  const statusFilteredOrders = orders.filter(statusMatches);
  const filteredOrders = query
    ? statusFilteredOrders.filter(
        (order) =>
          order.order_number.toLowerCase().includes(query) ||
          order.customer_email.toLowerCase().includes(query),
      )
    : statusFilteredOrders;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / 10));
  const page = Math.min(Math.max(Number.parseInt(requestedPage ?? "1", 10) || 1, 1), totalPages);
  const visibleOrders = filteredOrders.slice((page - 1) * 10, page * 10);

  const paymentReviewCount = orders.filter(
    (order) =>
      order.status === "PAYMENT_REVIEW",
  ).length;

  const pendingCount = orders.filter(
    (order) => order.status === "PENDING_PAYMENT",
  ).length;

  const trashedCount = orders.filter(
    (order) => order.status === "TRASHED",
  ).length;

  const activeOrderCount = orders.length - trashedCount;

  const deliveredCount = orders.filter(
    (order) => order.status === "DELIVERED",
  ).length;

  const processingCount = orders.filter(
    (order) => order.status === "PROCESSING",
  ).length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <AdminOrdersAutoRefresh />
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar
          orderCount={processingCount}
        />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header>
            <h1 className="text-3xl font-black">
              Orders
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              View customers, order amounts,
              payment progress and delivery status.
            </p>
          </header>

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              {success}
            </div>
          )}

          {actionError && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {actionError}
            </div>
          )}

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">
                Total orders
              </p>

              <p className="mt-2 text-3xl font-black">
                {activeOrderCount}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">
                Payment review
              </p>

              <p className="mt-2 text-3xl font-black text-amber-600">
                {paymentReviewCount}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">
                Processing
              </p>

              <p className="mt-2 text-3xl font-black text-slate-600">
                {processingCount}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">
                Completed
              </p>

              <p className="mt-2 text-3xl font-black text-emerald-600">
                {deliveredCount}
              </p>
            </div>
          </section>

          {error && (
            <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              Unable to load orders:{" "}
              {error.message}
            </div>
          )}

          {!error && orders.length === 0 && (
            <div className="mt-8 rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
              No orders are available.
            </div>
          )}

          {!error && orders.length > 0 && (
            <section className="mt-8">
              <nav className="mb-5 flex flex-wrap gap-2" aria-label="Order status filters">
                {[
                  { key: "all", label: "All orders", count: activeOrderCount },
                  { key: "pending", label: "Pending", count: pendingCount },
                  { key: "review", label: "Payment review", count: paymentReviewCount },
                  { key: "processing", label: "Processing", count: processingCount },
                  { key: "completed", label: "Completed", count: deliveredCount },
                  { key: "trash", label: "Trash", count: trashedCount },
                ].map((tab) => {
                  const params = new URLSearchParams();
                  if (tab.key !== "all") params.set("status", tab.key);
                  if (query) params.set("q", requestedQuery ?? "");
                  const href = params.size ? `/admin/orders?${params.toString()}` : "/admin/orders";

                  return (
                    <Link
                      key={tab.key}
                      href={href}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-black transition ${
                        activeStatus === tab.key
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                      }`}
                    >
                      {tab.label} <span className={activeStatus === tab.key ? "text-blue-100" : "text-slate-400"}>({tab.count})</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-black">
                    {activeStatus === "all"
                      ? "All orders"
                      : activeStatus === "review"
                        ? "Payment review orders"
                        : activeStatus === "trash"
                          ? "Trash"
                        : `${activeStatus.charAt(0).toUpperCase()}${activeStatus.slice(1)} orders`}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeStatus === "trash"
                      ? "Orders in Trash are permanently deleted after 30 days."
                      : "Newest orders appear first."}
                  </p>
                </div>
                <form method="get" className="flex w-full max-w-xl gap-2">
                  {activeStatus !== "all" && (
                    <input type="hidden" name="status" value={activeStatus} />
                  )}
                  <input
                    name="q"
                    defaultValue={requestedQuery ?? ""}
                    placeholder="Search order number or customer email"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                  <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500">
                    Search
                  </button>
                  {query && (
                    <Link href={activeStatus === "all" ? "/admin/orders" : `/admin/orders?status=${activeStatus}`} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600 hover:border-blue-300">
                      Clear
                    </Link>
                  )}
                </form>
              </div>

              {query && filteredOrders.length === 0 && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center font-bold text-amber-800">
                  No orders found for “{requestedQuery}”.
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <AdminOrdersTableScroller>
                  <table className="w-full min-w-[980px] table-fixed text-left">
                    <colgroup>
                      <col className="w-[16%]" />
                      <col className="w-[17%]" />
                      <col className="w-[36%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                    </colgroup>
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr className="text-sm text-slate-500">
                        <th className="px-3 py-4">
                          Order
                        </th>

                        <th className="px-3 py-4">
                          Customer email
                        </th>

                        <th className="px-3 py-4">
                          Product and fulfillment
                        </th>

                        <th className="px-3 py-4">
                          Amount
                        </th>

                        <th className="px-3 py-4">
                          Status
                        </th>

                        <th className="px-3 py-4">
                          Timeline
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {visibleOrders.map((order) => (
                        <tr
                          key={order.id}
                          id={`order-${order.id}`}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="break-words px-3 py-5 align-top">
                            <AdminOrderLink
                              orderId={order.id}
                              orderNumber={order.order_number}
                            />
                          </td>

                          <td className="break-words px-3 py-5 align-top">
                            {customerIdByEmail.get(order.customer_email.trim().toLowerCase()) ? (
                              <Link
                                href={`/admin/customers/${encodeURIComponent(customerIdByEmail.get(order.customer_email.trim().toLowerCase())!)}`}
                                className="break-all font-bold text-blue-600 hover:text-blue-500 hover:underline"
                              >
                                {order.customer_email}
                              </Link>
                            ) : (
                              <p className="break-all font-bold text-slate-700">
                                {order.customer_email}
                              </p>
                            )}
                          </td>

                          <td className="break-words px-3 py-5 align-top">
                            <div className="grid gap-3">
                              {order.order_items.map(
                                (item) => (
                                  <div key={item.id}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-bold">
                                        {item.product_name}
                                        {item.quantity > 1
                                          ? ` × ${item.quantity}`
                                          : ""}
                                      </p>
                                      {Number(item.affiliate_commission_percent ?? 0) > 0 && (
                                        <span className="inline-flex rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-fuchsia-700">
                                          Affiliate sale · {Number(item.affiliate_commission_percent)}%
                                        </span>
                                      )}
                                    </div>

                                    <p className="mt-1 text-sm text-slate-500">
                                      {item.option_name ||
                                        (item.denomination
                                          ? String(item.denomination)
                                          : "Standard option")}
                                    </p>

                                    {item.platform && (
                                      <p className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">
                                        Platform: {item.platform}
                                      </p>
                                    )}

                                    {item.fulfillment_mode && (
                                      <p className="mt-1 text-xs font-bold text-blue-600">
                                        {item.fulfillment_mode.replaceAll(
                                          "_",
                                          " ",
                                        )}
                                      </p>
                                    )}

                                    {item.player_id && (
                                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                                        Player ID: {item.player_id}
                                      </p>
                                    )}
                                    {(item.customer_information ?? []).map((field) => (
                                      <p key={field.fieldId} className="mt-1 break-all rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-800">
                                        {field.label}: <span className="font-bold">{field.value}</span>
                                      </p>
                                    ))}
                                  </div>
                                ),
                              )}

                            </div>
                          </td>

                          <td className="break-words px-3 py-5 align-top font-bold">
                            {formatMoney(
                              order.total,
                              order.currency,
                            )}
                          </td>

                          <td className="break-words px-3 py-5 align-top">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusStyle(
                                order.status,
                              )}`}
                            >
                              {order.status ===
                              "DELIVERED"
                                ? "COMPLETED"
                                : order.status.replaceAll(
                                    "_",
                                    " ",
                                  )}
                            </span>
                          </td>

                          <td className="break-words px-3 py-5 align-top text-xs text-slate-600">
                            <span className="block font-bold text-slate-500">
                              Ordered
                            </span>
                            <span className="mt-1 block">
                              {formatDate(order.created_at)}
                            </span>
                            {order.delivered_at && (
                              <>
                                <span className="mt-3 block font-bold text-slate-500">
                                  Completed
                                </span>
                                <span className="mt-1 block">
                                  {formatDate(order.delivered_at)}
                                </span>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminOrdersTableScroller>
              </div>
              {totalPages > 1 && (
                <nav className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Order pages">
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                    <Link key={pageNumber} href={`/admin/orders?${new URLSearchParams({ page: String(pageNumber), ...(query ? { q: requestedQuery ?? "" } : {}), ...(activeStatus !== "all" ? { status: activeStatus } : {}) }).toString()}`} className={`rounded-lg border px-3 py-2 text-sm font-bold ${pageNumber === page ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>{pageNumber}</Link>
                  ))}
                </nav>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}




