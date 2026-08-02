import { redirect } from "next/navigation";

import Link from "next/link";
import AdminOrderLink from "../AdminOrderLink";
import AdminSidebar from "../AdminSidebar";
import AdminOrdersTableScroller from "./AdminOrdersTableScroller";
import CompletedManualDeliveryCard from "./CompletedManualDeliveryCard";
import ManualDeliveryItemCard from "./ManualDeliveryItemCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { finalizeManualOrderFromCodes } from "./actions";

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
  products:
    | { delivery_type: "MANUAL" | "AUTOMATIC" }
    | { delivery_type: "MANUAL" | "AUTOMATIC" }[]
    | null;
};

type AdminOrdersPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    order?: string;
    page?: string;
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
    order: selectedOrderId,
    page: requestedPage,
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
  const totalPages = Math.max(1, Math.ceil(orders.length / 10));
  const page = Math.min(Math.max(Number.parseInt(requestedPage ?? "1", 10) || 1, 1), totalPages);
  const visibleOrders = orders.slice((page - 1) * 10, page * 10);
  const visibleItemIds = visibleOrders.flatMap((order) =>
    order.order_items.map((item) => item.id),
  );
  const soldCodesResult = visibleItemIds.length
    ? await createAdminClient()
        .from("gift_card_codes")
        .select("order_item_id, code, sold_at")
        .in("order_item_id", visibleItemIds)
        .eq("status", "SOLD")
    : { data: [] };
  const soldCodeCounts = new Map<string, number>();
  const deliveredCodes = new Map<string, Array<{ code: string; sold_at: string | null }>>();
  for (const code of soldCodesResult.data ?? []) {
    if (!code.order_item_id) continue;
    soldCodeCounts.set(
      code.order_item_id,
      (soldCodeCounts.get(code.order_item_id) ?? 0) + 1,
    );
    deliveredCodes.set(code.order_item_id, [
      ...(deliveredCodes.get(code.order_item_id) ?? []),
      { code: code.code, sold_at: code.sold_at },
    ]);
  }

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
                          Customer
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
                          className={`scroll-mt-32 transition hover:bg-blue-50/40 ${
                            selectedOrderId === order.id
                              ? "bg-cyan-50 ring-2 ring-inset ring-cyan-400"
                              : ""
                          }`}
                        >
                          <td className="break-words px-3 py-5 align-top">
                            <AdminOrderLink
                              orderId={order.id}
                              orderNumber={order.order_number}
                            />

                            <p className="mt-1 max-w-40 truncate text-xs text-slate-400">
                              {order.id}
                            </p>
                          </td>

                          <td className="break-words px-3 py-5 align-top">
                            <p className="font-bold">
                              {order.customer_name ||
                                "Customer"}
                            </p>

                            <p className="mt-1 break-all text-sm text-slate-500">
                              {order.customer_email}
                            </p>

                            {order.customer_phone && (
                              <p className="mt-1 text-xs text-slate-400">
                                {order.customer_phone}
                              </p>
                            )}
                          </td>

                          <td className="break-words px-3 py-5 align-top">
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
                                    {(item.customer_information ?? []).map((field) => (
                                      <p key={field.fieldId} className="mt-1 break-all rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-800">
                                        {field.label}: <span className="font-bold">{field.value}</span>
                                      </p>
                                    ))}
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
                                <div
                                  className="mt-3 grid gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:grid-cols-2"
                                >
                                  <p className="text-sm font-black text-blue-800 sm:col-span-2">
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
                                      ) : (soldCodeCounts.get(item.id) ?? 0) >= item.quantity ? (
                                        <CompletedManualDeliveryCard
                                          key={item.id}
                                          productName={item.product_name}
                                          optionName={item.option_name}
                                          codes={deliveredCodes.get(item.id) ?? []}
                                        />
                                      ) : <ManualDeliveryItemCard key={item.id} orderId={order.id} item={item} />,
                                  )}
                                  {order.order_items.filter((item) => { const product = Array.isArray(item.products) ? item.products[0] : item.products; return product?.delivery_type === "MANUAL" && item.fulfillment_mode !== "PLAYER_ID_TOPUP"; }).every((item) => (soldCodeCounts.get(item.id) ?? 0) >= item.quantity) && <form action={finalizeManualOrderFromCodes} className="sm:col-span-2"><input type="hidden" name="order_id" value={order.id} /><button className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-black text-white">Finalize completed order</button></form>}
                                </div>
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
                    <Link key={pageNumber} href={`/admin/orders?page=${pageNumber}`} className={`rounded-lg border px-3 py-2 text-sm font-bold ${pageNumber === page ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>{pageNumber}</Link>
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




