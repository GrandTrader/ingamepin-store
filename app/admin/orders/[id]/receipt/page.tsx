import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../AdminSidebar";
import CompletedManualDeliveryCard from "../../CompletedManualDeliveryCard";
import ManualDeliveryItemCard from "../../ManualDeliveryItemCard";
import CopyableCustomerInformation from "../../CopyableCustomerInformation";
import AdminRefundCard from "../../AdminRefundCard";
import {
  completeManualOrder,
  finalizeManualOrderFromCodes,
  verifyOrderPaymentManually,
} from "../../actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReceiptPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type ProductRelation =
  | { delivery_type: "MANUAL" | "AUTOMATIC"; is_bulk_order: boolean }
  | { delivery_type: "MANUAL" | "AUTOMATIC"; is_bulk_order: boolean }[]
  | null;

type OrderItem = {
  id: string;
  product_name: string;
  option_name: string | null;
  denomination: number | null;
  platform: string | null;
  fulfillment_mode: string | null;
  player_id: string | null;
  customer_information: Array<{
    fieldId: string;
    label: string;
    value: string;
  }>;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  products: ProductRelation;
};

type DeliveredCode = {
  order_item_id: string | null;
  code: string;
  sold_at: string | null;
};

function getDeliveryType(products: ProductRelation) {
  return Array.isArray(products)
    ? products[0]?.delivery_type
    : products?.delivery_type;
}

function isBulkProduct(products: ProductRelation) {
  return Array.isArray(products)
    ? Boolean(products[0]?.is_bulk_order)
    : Boolean(products?.is_bulk_order);
}

function formatMoney(amount: number | string, currency: string) {
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

function Detail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2 border-b border-slate-200 py-3 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)]">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="min-w-0 break-all text-sm font-medium">
        {value || "—"}
      </span>
    </div>
  );
}

export default async function OrderReceipt({
  params,
  searchParams,
}: ReceiptPageProps) {
  const [{ id }, { error: actionError, success }] =
    await Promise.all([params, searchParams]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) {
    redirect("/admin/login?error=Access denied");
  }

  const admin = createAdminClient();
  const [orderResult, itemsResult, paymentResult] =
    await Promise.all([
      admin
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_email, customer_phone, currency, subtotal, discount, total, status, customer_note, admin_note, created_at, paid_at, delivered_at",
        )
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("order_items")
        .select(
          `
            id,
            product_name,
            option_name,
            denomination,
            platform,
            fulfillment_mode,
            player_id,
            customer_information,
            quantity,
            unit_price,
            total_price,
            products (
              delivery_type,
              is_bulk_order
            )
          `,
        )
        .eq("order_id", id)
        .order("created_at"),
      admin
        .from("payments")
        .select(
          "id, method, status, amount, currency, transaction_id, gateway_order_id, gateway_payment_id, submitted_at, verified_at",
        )
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (orderResult.error || !orderResult.data) {
    notFound();
  }

  if (itemsResult.error) {
    throw new Error(
      `Unable to load order items: ${itemsResult.error.message}`,
    );
  }

  const order = orderResult.data;
  const payment = paymentResult.data;
  const items = (itemsResult.data ?? []) as OrderItem[];
  const itemIds = items.map((item) => item.id);
  const deliveredCodes: DeliveredCode[] = [];
  const deliveredCodePageSize = 1000;

  for (let from = 0; itemIds.length > 0; from += deliveredCodePageSize) {
    const page = await admin
        .from("gift_card_codes")
        .select("id, order_item_id, code, sold_at")
        .in("order_item_id", itemIds)
        .eq("status", "SOLD")
        .order("sold_at")
        .order("id")
        .range(from, from + deliveredCodePageSize - 1);

    if (page.error) {
      throw new Error(`Unable to load delivered codes: ${page.error.message}`);
    }

    const pageCodes = (page.data ?? []) as DeliveredCode[];
    deliveredCodes.push(...pageCodes);
    if (pageCodes.length < deliveredCodePageSize) {
      break;
    }
  }

  const codesByItem = new Map<string, DeliveredCode[]>();
  for (const code of deliveredCodes) {
    if (!code.order_item_id) {
      continue;
    }

    codesByItem.set(code.order_item_id, [
      ...(codesByItem.get(code.order_item_id) ?? []),
      code,
    ]);
  }

  const refundsResult = itemIds.length
    ? await admin.from("order_item_refunds")
        .select("id, order_item_id, quantity, amount, currency, status")
        .in("order_item_id", itemIds)
        .order("created_at")
    : { data: [], error: null };
  if (refundsResult.error) throw new Error(`Unable to load refunds: ${refundsResult.error.message}`);
  const refundsByItem = new Map<string, Array<{ id: string; quantity: number; amount: number | string; currency: string; status: string }>>();
  for (const refund of refundsResult.data ?? []) {
    refundsByItem.set(refund.order_item_id, [...(refundsByItem.get(refund.order_item_id) ?? []), refund]);
  }
  const refundedQuantityFor = (itemId: string) => (refundsByItem.get(itemId) ?? [])
    .filter((refund) => refund.status !== "CANCELLED")
    .reduce((sum, refund) => sum + refund.quantity, 0);

  const deliveredContentItems = items
    .map((item) => ({
      item,
      codes: codesByItem.get(item.id) ?? [],
    }))
    .filter(({ codes }) => codes.length > 0);

  const manualItems = items.filter(
    (item) => getDeliveryType(item.products) === "MANUAL",
  );
  const manualCodeItems = manualItems.filter(
    (item) => item.fulfillment_mode !== "PLAYER_ID_TOPUP",
  );
  const playerTopupItems = manualItems.filter(
    (item) => item.fulfillment_mode === "PLAYER_ID_TOPUP",
  );
  const allManualCodesSent =
    manualCodeItems.length > 0 &&
    manualCodeItems.every(
      (item) =>
        (codesByItem.get(item.id)?.length ?? 0) + refundedQuantityFor(item.id) === item.quantity,
    );
  const canDeliver =
    order.status === "PAID" || order.status === "PROCESSING";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-500"
              >
                ← Back to orders
              </Link>
              <p className="mt-6 text-xs font-bold uppercase tracking-widest text-blue-600">
                Order receipt
              </p>
              <h1 className="mt-2 break-all text-3xl font-black">
                {order.order_number}
              </h1>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusStyle(
                  order.status,
                )}`}
              >
                {order.status === "DELIVERED"
                  ? "COMPLETED"
                  : order.status.replaceAll("_", " ")}
              </span>
            </div>
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

          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Order date</p>
              <p className="mt-2 font-black">
                {formatDate(order.created_at)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Payment method</p>
              <p className="mt-2 font-black">
                {payment?.method?.replaceAll("_", " ") ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Payment status</p>
              <p className="mt-2 font-black text-emerald-600">
                {payment?.status?.replaceAll("_", " ") ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm text-slate-500">Order total</p>
              <p className="mt-2 text-xl font-black">
                {formatMoney(order.total, order.currency)}
              </p>
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-black">Customer details</h2>
              <div className="mt-3">
                <Detail label="Customer name" value={order.customer_name} />
                <Detail label="Email" value={order.customer_email} />
                <Detail label="Phone" value={order.customer_phone} />
                <Detail label="Customer note" value={order.customer_note} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-black">Payment details</h2>
              <div className="mt-3">
                <Detail label="Transaction ID" value={payment?.transaction_id} />
                <Detail label="Gateway order ID" value={payment?.gateway_order_id} />
                <Detail label="Gateway payment ID" value={payment?.gateway_payment_id} />
                <Detail
                  label="Verified at"
                  value={formatDate(payment?.verified_at ?? null)}
                />
              </div>
            </section>
          </div>

          {payment?.status === "PENDING" && payment.gateway_order_id && (
            <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                Admin payment override
              </p>
              <h2 className="mt-2 text-xl font-black text-amber-950">
                Verify payment manually
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-800">
                Use this only after independently confirming that the full order
                amount was received. Verification immediately unlocks order
                delivery and cannot be undone here.
              </p>

              <form
                action={verifyOrderPaymentManually}
                className="mt-5 grid gap-4"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="payment_id" value={payment.id} />

                <label className="block max-w-3xl text-sm font-bold text-slate-800">
                  Transaction hash or payment reference
                  <input
                    name="transaction_id"
                    required
                    minLength={6}
                    maxLength={200}
                    autoComplete="off"
                    placeholder="Enter the confirmed transaction reference"
                    className="mt-2 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 font-mono outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                  />
                </label>

                <label className="flex max-w-3xl items-start gap-3 rounded-xl border border-amber-200 bg-white p-4 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="payment_confirmed"
                    required
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    I independently confirmed receipt of the full payment of{" "}
                    <strong>{formatMoney(order.total, order.currency)}</strong>.
                  </span>
                </label>

                <button className="w-fit rounded-xl bg-amber-600 px-6 py-3 font-black text-white transition hover:bg-amber-500">
                  Verify Payment Manually
                </button>
              </form>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-black">Purchased products</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Denomination / option</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Unit price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-4 py-4 align-top">
                        <p className="font-bold">{item.product_name}</p>
                        {item.platform && (
                          <p className="mt-1 text-xs text-slate-500">
                            Platform: {item.platform}
                          </p>
                        )}
                        <CopyableCustomerInformation
                          playerId={item.player_id}
                          fields={item.customer_information ?? []}
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        {item.option_name ??
                          (item.denomination
                            ? String(item.denomination)
                            : "Standard option")}
                      </td>
                      <td className="px-4 py-4 align-top">{item.quantity}</td>
                      <td className="px-4 py-4 align-top">
                        {formatMoney(item.unit_price, order.currency)}
                      </td>
                      <td className="px-4 py-4 text-right align-top font-bold">
                        {formatMoney(item.total_price, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto mt-6 w-full max-w-sm rounded-xl bg-slate-50 p-4">
              <div className="flex justify-between gap-5 py-2 text-sm">
                <span className="text-slate-500">Subtotal</span>
                <strong>{formatMoney(order.subtotal, order.currency)}</strong>
              </div>
              <div className="flex justify-between gap-5 py-2 text-sm">
                <span className="text-slate-500">Discount</span>
                <strong>{formatMoney(order.discount, order.currency)}</strong>
              </div>
              <div className="mt-2 flex justify-between gap-5 border-t border-slate-200 pt-4 text-lg">
                <span className="font-black">Total paid</span>
                <strong>{formatMoney(order.total, order.currency)}</strong>
              </div>
            </div>
          </section>

          {deliveredContentItems.length > 0 && (
            <details className="group mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">
                    Fulfilled products
                  </p>
                  <h2 className="mt-2 text-xl font-black text-emerald-950">
                    Delivered content
                  </h2>
                  <p className="mt-2 text-sm text-emerald-800">
                    {deliveredContentItems.reduce(
                      (total, deliveredItem) =>
                        total + deliveredItem.codes.length,
                      0,
                    )}{" "}
                    delivered code(s). Click to view or hide them.
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-black text-emerald-800">
                  <span className="group-open:hidden">Show codes</span>
                  <span className="hidden group-open:inline">Hide codes</span>
                </span>
              </summary>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {deliveredContentItems.map(({ item, codes }) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-emerald-200 bg-white p-4"
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                      <div>
                        <h3 className="font-black text-slate-900">
                          {item.product_name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.option_name ??
                            (item.denomination
                              ? String(item.denomination)
                              : "Standard option")}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                        DELIVERED
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {codes.map((entry, index) => (
                        <div
                          key={`${entry.code}-${index}`}
                          className="rounded-lg bg-slate-950 p-3"
                        >
                          <p className="break-all font-mono text-sm font-bold text-cyan-300">
                            {entry.code}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {entry.sold_at
                              ? `Delivered ${formatDate(entry.sold_at)}`
                              : "Delivery date unavailable"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}

          {manualCodeItems.length > 0 && (
            <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
              <h2 className="text-xl font-black text-blue-900">
                Manual delivery
              </h2>
              <p className="mt-2 text-sm text-blue-700">
                Deliver every denomination separately. Finalize the order only
                after all denominations are completed.
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {manualCodeItems.map((item) => {
                  const deliveredCodes = codesByItem.get(item.id) ?? [];
                  const refundedQuantity = refundedQuantityFor(item.id);
                  const itemCompleted =
                    deliveredCodes.length + refundedQuantity >= item.quantity;

                  if (itemCompleted) {
                    return (
                      <CompletedManualDeliveryCard
                        key={item.id}
                        productName={item.product_name}
                        optionName={
                          item.option_name ??
                          (item.denomination
                            ? String(item.denomination)
                            : null)
                        }
                        codes={deliveredCodes.map((code) => ({
                          code: code.code,
                          sold_at: code.sold_at,
                        }))}
                      />
                    );
                  }

                  if (!canDeliver) {
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <p className="font-black">{item.product_name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.option_name ?? item.denomination ?? "Standard option"}
                        </p>
                        <p className="mt-3 text-sm font-bold text-amber-700">
                          Payment must be verified before delivery.
                        </p>
                      </article>
                    );
                  }

                  return (
                    <ManualDeliveryItemCard
                      key={item.id}
                      orderId={order.id}
                      item={{
                        id: item.id,
                        product_name: item.product_name,
                        option_name:
                          item.option_name ??
                          (item.denomination
                            ? String(item.denomination)
                            : null),
                        quantity: item.quantity,
                        delivered_count: deliveredCodes.length + refundedQuantity,
                        is_bulk_order: isBulkProduct(item.products),
                      }}
                    />
                  );
                })}
              </div>

              {canDeliver && <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {manualCodeItems.map((item) => <AdminRefundCard key={`refund-${item.id}`} orderId={order.id} item={item} deliveredQuantity={codesByItem.get(item.id)?.length ?? 0} refunds={refundsByItem.get(item.id) ?? []} />)}
              </div>}

              {canDeliver && allManualCodesSent && playerTopupItems.length === 0 && (
                <form action={finalizeManualOrderFromCodes} className="mt-5">
                  <input type="hidden" name="order_id" value={order.id} />
                  <button className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white transition hover:bg-emerald-500">
                    Finalize Delivery
                  </button>
                </form>
              )}

              {canDeliver && !allManualCodesSent && (
                <p className="mt-5 rounded-xl bg-white p-4 text-center text-sm font-bold text-blue-800">
                  Complete every denomination to enable Finalize Delivery.
                </p>
              )}
            </section>
          )}

          {playerTopupItems.length > 0 && (
            <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
              <h2 className="text-xl font-black text-amber-900">
                Player ID top-up delivery
              </h2>

              {order.status === "DELIVERED" ? (
                <p className="mt-4 rounded-xl bg-white p-4 font-bold text-emerald-700">
                  Player ID top-up completed.
                </p>
              ) : canDeliver && manualCodeItems.length === 0 ? (
                <form action={completeManualOrder} className="mt-4 grid gap-3">
                  <input type="hidden" name="order_id" value={order.id} />
                  {playerTopupItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl bg-white p-4"
                    >
                      <input
                        type="checkbox"
                        name={`completed_${item.id}`}
                        required
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <strong className="block">
                          Confirm {item.product_name} completed
                        </strong>
                        <span className="mt-1 block text-sm text-slate-500">
                          {item.player_id
                            ? `Player ID: ${item.player_id}`
                            : "Confirm the customer top-up is complete."}
                        </span>
                      </span>
                    </label>
                  ))}
                  <button className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-500">
                    Finalize Player ID Delivery
                  </button>
                </form>
              ) : (
                <p className="mt-4 rounded-xl bg-white p-4 text-sm font-bold text-amber-800">
                  Complete the code-delivery items before finalizing this top-up.
                </p>
              )}
            </section>
          )}

          {manualItems.length === 0 && order.status === "DELIVERED" && (
            <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 sm:p-6">
              <h2 className="text-lg font-black">Instant delivery completed</h2>
              <p className="mt-2 text-sm">
                This order was fulfilled automatically after successful payment.
              </p>
            </section>
          )}

          {(order.admin_note || order.delivered_at) && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-black">Completion details</h2>
              <div className="mt-3">
                <Detail label="Admin note" value={order.admin_note} />
                <Detail
                  label="Paid at"
                  value={formatDate(order.paid_at)}
                />
                <Detail
                  label="Delivered at"
                  value={formatDate(order.delivered_at)}
                />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
