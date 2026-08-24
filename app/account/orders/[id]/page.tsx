import Link from "next/link";
import { notFound } from "next/navigation";

import CustomerAccountShell from "../../CustomerAccountShell";
import DeliveredCodesDownloadButton from "@/components/DeliveredCodesDownloadButton";
import VerifiedPurchaseReview from "@/components/VerifiedPurchaseReview";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";
import {
  customerStatusClass,
  formatCustomerDate,
  formatCustomerMoney,
  requireCustomer,
} from "@/lib/customer-account-data";

export const dynamic = "force-dynamic";

type CustomerOrderReceiptPageProps = {
  params: Promise<{ id: string }>;
};

type OrderItem = {
  id: string;
  product_name: string;
  option_name: string | null;
  denomination: number | null;
  platform: string | null;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
};

type DeliveredCode = {
  order_item_id: string | null;
  code: string;
};

function displayStatus(status: string) {
  return status === "DELIVERED"
    ? "COMPLETED"
    : status.replaceAll("_", " ");
}

export default async function CustomerOrderReceiptPage({
  params,
}: CustomerOrderReceiptPageProps) {
  const [{ id }, { user, displayName }] = await Promise.all([
    params,
    requireCustomer(),
  ]);

  const admin = createAdminClient();
  const customerEmail = user.email!.trim().toLowerCase();

  const [orderResult, itemsResult, paymentResult] = await Promise.all([
    admin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, currency, subtotal, discount, total, status, customer_note, created_at, paid_at, delivered_at",
      )
      .eq("id", id)
      .eq("customer_email", customerEmail)
      .maybeSingle(),
    admin
      .from("order_items")
      .select(
        "id, product_name, option_name, denomination, platform, quantity, unit_price, total_price",
      )
      .eq("order_id", id)
      .order("created_at"),
    admin
      .from("payments")
      .select("method, status, transaction_id, verified_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (orderResult.error || !orderResult.data) {
    notFound();
  }

  if (itemsResult.error) {
    throw new Error(`Unable to load order items: ${itemsResult.error.message}`);
  }

  if (paymentResult.error) {
    throw new Error(`Unable to load payment details: ${paymentResult.error.message}`);
  }

  const order = orderResult.data;
  const items = (itemsResult.data ?? []) as OrderItem[];
  const payment = paymentResult.data;
  const itemIds = items.map((item) => item.id);
  const deliveredCodes = await getAllDeliveredCodes(itemIds);

  const codesByItem = new Map<string, string[]>();
  for (const deliveredCode of deliveredCodes as DeliveredCode[]) {
    if (!deliveredCode.order_item_id) continue;

    codesByItem.set(deliveredCode.order_item_id, [
      ...(codesByItem.get(deliveredCode.order_item_id) ?? []),
      deliveredCode.code,
    ]);
  }

  const downloadableItems = items
    .map((item) => ({
      productName: item.product_name,
      optionName: item.option_name,
      denomination: item.denomination,
      platform: item.platform,
      codes: codesByItem.get(item.id) ?? [],
    }))
    .filter((item) => item.codes.length > 0);

  return (
    <CustomerAccountShell displayName={displayName}>
      <Link
        href="/account/orders"
        className="text-sm font-bold text-cyan-700 hover:text-cyan-600"
      >
        ← Back to My Orders
      </Link>

      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
            Order receipt
          </p>
          <h1 className="mt-2 break-all text-2xl font-black sm:text-3xl">
            {order.order_number}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Ordered {formatCustomerDate(order.created_at)}
          </p>
        </div>

        <span
          className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${customerStatusClass(
            order.status,
          )}`}
        >
          {displayStatus(order.status)}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Order total" value={formatCustomerMoney(order.total, order.currency)} />
        <SummaryCard label="Payment method" value={payment?.method?.replaceAll("_", " ") ?? "—"} />
        <SummaryCard label="Payment status" value={payment?.status?.replaceAll("_", " ") ?? "PENDING"} />
        <SummaryCard
          label="Delivered"
          value={order.delivered_at ? formatCustomerDate(order.delivered_at) : "Not delivered yet"}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black">Order items</h2>

        <div className="mt-4 divide-y divide-slate-200">
          {items.map((item) => (
            <article
              key={item.id}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <h3 className="font-black text-slate-900">{item.product_name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {[item.option_name, item.platform].filter(Boolean).join(" · ") ||
                    (item.denomination !== null
                      ? `Denomination: ${item.denomination}`
                      : "Standard option")}
                </p>
                <p className="mt-1 text-xs text-slate-400">Quantity: {item.quantity}</p>
              </div>

              <p className="font-black text-slate-900">
                {formatCustomerMoney(item.total_price, order.currency)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-black">Delivered content</h2>
            <p className="mt-1 text-sm text-slate-500">
              Codes appear here only after the order has been delivered.
            </p>
          </div>

          <DeliveredCodesDownloadButton
            orderNumber={order.order_number}
            items={downloadableItems}
            label="Download All Codes (.txt)"
            variant="primary"
            includeItemDetails
          />
        </div>

        {downloadableItems.length === 0 ? (
          <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            No delivered digital codes are available yet.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {downloadableItems.map((item, itemIndex) => (
              <article
                key={`${item.productName}-${itemIndex}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <h3 className="font-black">{item.productName}</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-cyan-700">
                  Denomination / option: {item.denomination ?? item.optionName ?? item.platform ?? "Standard"}
                </p>

                <div className="mt-3">
                  <DeliveredCodesDownloadButton
                    orderNumber={order.order_number}
                    items={[item]}
                    label="Download this denomination"
                    variant="secondary"
                  />
                </div>

                <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-black text-slate-700">
                    Show {item.codes.length} delivered code{item.codes.length === 1 ? "" : "s"}
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {item.codes.map((code, codeIndex) => (
                      <div
                        key={`${code}-${codeIndex}`}
                        className="break-all rounded-lg bg-slate-950 p-3 font-mono text-sm font-bold text-cyan-300"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      {order.status === "DELIVERED" && (
        <VerifiedPurchaseReview orderId={order.id} />
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black">Customer details</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <ReceiptDetail label="Name" value={order.customer_name} />
            <ReceiptDetail label="Email" value={order.customer_email} />
            <ReceiptDetail label="Phone" value={order.customer_phone || "—"} />
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black">Payment details</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <ReceiptDetail label="Subtotal" value={formatCustomerMoney(order.subtotal, order.currency)} />
            <ReceiptDetail label="Discount" value={formatCustomerMoney(order.discount, order.currency)} />
            <ReceiptDetail label="Transaction ID" value={payment?.transaction_id || "—"} />
          </dl>
        </div>
      </section>
    </CustomerAccountShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 break-words font-black text-slate-900">{value}</p>
    </div>
  );
}

function ReceiptDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[120px_minmax(0,1fr)]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-bold text-slate-900">{value}</dd>
    </div>
  );
}
