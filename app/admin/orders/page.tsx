import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import { completeManualOrder } from "./actions";
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
  quantity: number;
  products:
    | { delivery_type: "MANUAL" | "AUTOMATIC" }
    | { delivery_type: "MANUAL" | "AUTOMATIC" }[]
    | null;
};

type AdminOrdersPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

function formatMoney(
  amount: number | string,
  currency: string,
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
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

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const { error: actionError, success } =
    await searchParams;

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
          quantity,
          products (
            delivery_type
          )
        )
      `,
    )
    .order("created_at", {
      ascending: false,
    });

  const orders = (data ?? []) as Order[];

  const paymentReviewCount = orders.filter(
    (order) =>
      order.status === "PAYMENT_REVIEW",
  ).length;

  const deliveredCount = orders.filter(
    (order) => order.status === "DELIVERED",
  ).length;

  const processingCount = orders.filter(
    (order) =>
      order.status === "PROCESSING" ||
      order.status === "PAID",
  ).length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar
          orderCount={paymentReviewCount}
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
                {orders.length}
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
              <div className="mb-4">
                <h2 className="text-xl font-black">
                  All orders
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Newest orders appear first.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1250px] text-left">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr className="text-sm text-slate-500">
                        <th className="px-5 py-4">
                          Order
                        </th>

                        <th className="px-5 py-4">
                          Customer
                        </th>

                        <th className="px-5 py-4">
                          Product and fulfillment
                        </th>

                        <th className="px-5 py-4">
                          Amount
                        </th>

                        <th className="px-5 py-4">
                          Status
                        </th>

                        <th className="px-5 py-4">
                          Ordered
                        </th>

                        <th className="px-5 py-4">
                          Completed
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {orders.map((order) => (
                        <tr
                          key={order.id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="px-5 py-5">
                            <p className="font-bold text-blue-600">
                              {order.order_number}
                            </p>

                            <p className="mt-1 max-w-40 truncate text-xs text-slate-400">
                              {order.id}
                            </p>
                          </td>

                          <td className="px-5 py-5">
                            <p className="font-bold">
                              {order.customer_name ||
                                "Customer"}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {order.customer_email}
                            </p>

                            {order.customer_phone && (
                              <p className="mt-1 text-xs text-slate-400">
                                {order.customer_phone}
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-5">
                            <div className="grid gap-3">
                              {order.order_items.map(
                                (item) => (
                                  <div key={item.id}>
                                    <p className="font-bold">
                                      {item.product_name}
                                      {item.quantity > 1
                                        ? ` × ${item.quantity}`
                                        : ""}
                                    </p>

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
                                  </div>
                                ),
                              )}

                              {(order.status ===
                                "PROCESSING" ||
                                order.status ===
                                  "PAID") &&
                                order.order_items.some((item) => {
                                  const product = Array.isArray(item.products)
                                    ? item.products[0]
                                    : item.products;
                                  return product?.delivery_type === "MANUAL";
                                }) && (
                                <form
                                  action={
                                    completeManualOrder
                                  }
                                  className="mt-3 grid gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4"
                                >
                                  <input
                                    type="hidden"
                                    name="order_id"
                                    value={order.id}
                                  />

                                  <p className="text-sm font-black text-blue-800">
                                    Manual fulfillment
                                  </p>

                                  {order.order_items
                                    .filter((item) => {
                                      const product = Array.isArray(
                                        item.products,
                                      )
                                        ? item.products[0]
                                        : item.products;
                                      return (
                                        product?.delivery_type === "MANUAL"
                                      );
                                    })
                                    .map(
                                    (item) =>
                                      item.fulfillment_mode ===
                                      "PLAYER_ID_TOPUP" ? (
                                        <label
                                          key={
                                            item.id
                                          }
                                          className="flex items-start gap-3 rounded-lg bg-white p-3 text-sm"
                                        >
                                          <input
                                            type="checkbox"
                                            name={`completed_${item.id}`}
                                            required
                                            className="mt-1 h-4 w-4"
                                          />
                                          <span>
                                            <span className="block font-bold">
                                              Confirm top-up completed
                                            </span>
                                            <span className="mt-1 block text-xs text-slate-500">
                                              {
                                                item.product_name
                                              }
                                              {item.player_id
                                                ? ` · Player ID ${item.player_id}`
                                                : ""}
                                            </span>
                                          </span>
                                        </label>
                                      ) : (
                                        <label
                                          key={
                                            item.id
                                          }
                                          className="text-sm font-bold text-slate-700"
                                        >
                                          {
                                            item.product_name
                                          }
                                          {item.option_name
                                            ? ` · ${item.option_name}`
                                            : ""}
                                          <span className="mt-1 block text-xs font-normal text-slate-500">
                                            Enter exactly{" "}
                                            {
                                              item.quantity
                                            }{" "}
                                            code
                                            {item.quantity ===
                                            1
                                              ? ""
                                              : "s"}
                                            , one per line.
                                          </span>
                                          <textarea
                                            name={`codes_${item.id}`}
                                            rows={Math.min(
                                              Math.max(
                                                item.quantity +
                                                  1,
                                                3,
                                              ),
                                              8,
                                            )}
                                            required
                                            placeholder="Enter one delivery code per line"
                                            className="mt-2 w-full resize-y rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-500"
                                          />
                                        </label>
                                      ),
                                  )}

                                  <button
                                    type="submit"
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
                                  >
                                    Send Products &amp;
                                    Complete Order
                                  </button>
                                </form>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-5 font-bold">
                            {formatMoney(
                              order.total,
                              order.currency,
                            )}
                          </td>

                          <td className="px-5 py-5">
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

                          <td className="px-5 py-5 text-sm text-slate-600">
                            {formatDate(
                              order.created_at,
                            )}
                          </td>

                          <td className="px-5 py-5 text-sm text-slate-600">
                            {formatDate(
                              order.delivered_at,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
