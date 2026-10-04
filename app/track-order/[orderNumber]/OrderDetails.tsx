"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import DeliveryReceiptLink from "@/components/DeliveryReceiptLink";
import {
  useState,
  useEffect,
} from "react";

import DeliveredCodesDownloadButton from "@/components/DeliveredCodesDownloadButton";
import VerifiedPurchaseReview from "@/components/VerifiedPurchaseReview";

type LookupItem = {
  productName: string;
  optionName: string | null;
  denomination: number | null;
  platform: string | null;
  region: string | null;
  quantity: number;
  receiptUrl?: string | null;
  serviceCompleted?: boolean;
  codes: string[];
};

type LookupResult = {
  order?: {
    orderNumber: string;
    status: string;
    total: number | string;
    currency: string;
    orderedAt: string;
    paidAt: string | null;
    deliveredAt: string | null;
  };
  items?: LookupItem[];
  error?: string;
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

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function OrderDetails({ orderNumber, returnPage }: { orderNumber: string; returnPage: number }) {
  const router = useRouter();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrder() {
      setIsLoading(true); setError(""); setResult(null);
      try {
        const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber }), cache: "no-store", signal: controller.signal });
        const data = await response.json() as LookupResult;
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          router.replace(`/track-order?order=${encodeURIComponent(orderNumber)}&page=${returnPage}`);
          return;
        }
        if (!response.ok || !data.order) throw Error(data.error || "Unable to load this order.");
        setResult(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load this order.");
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }
    void loadOrder();
    return () => controller.abort();
  }, [orderNumber, returnPage, router, retry]);

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); } catch { setError("Unable to copy automatically. Select and copy the code."); return; }
    setCopiedCode(code);

    window.setTimeout(() => {
      setCopiedCode("");
    }, 1500);
  }

  const order = result?.order;
  const items = result?.items ?? [];
  const delivered =
    order?.status === "DELIVERED";
  const completedItemCount = items.filter(
    (item) => item.codes.length >= item.quantity,
  ).length;
  const hasDeliveredCodes = items.some(
    (item) => item.codes.length > 0,
  );

  return (
    <main className="track-order-page min-h-screen bg-slate-950 px-4 py-6 sm:py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href={returnPage > 1 ? `/track-order?page=${returnPage}` : "/track-order"} prefetch={false} className="inline-flex min-h-11 items-center text-sm font-bold text-cyan-400">← Back to orders</Link>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">Order details</h1>
        {isLoading && <p role="status" className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-5 text-sm">Loading purchase...</p>}
        {error && <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-5"><p role="alert" className="text-sm text-red-300">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 min-h-11 rounded-lg border px-4 text-sm font-bold">Try again</button></div>}

        {order && (
          <section className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-4 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-sm text-slate-400">
                  Order number
                </p>

                <h2 className="track-order-accent-text mt-1 break-all text-lg font-black sm:text-2xl">
                  {order.orderNumber}
                </h2>
              </div>

              <span
                className={`w-fit rounded-full px-4 py-2 text-xs font-black ${
                  delivered
                    ? "track-order-status-success"
                    : order.status ===
                        "CANCELLED"
                      ? "track-order-status-danger"
                      : "track-order-status-warning"
                }`}
              >
                {order.status === "DELIVERED"
                  ? "COMPLETED"
                  : order.status.replaceAll("_", " ")}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-slate-950 p-4 text-sm lg:grid-cols-4">
              <OrderInfo
                label="Amount"
                value={formatMoney(
                  order.total,
                  order.currency,
                )}
              />
              <OrderInfo
                label="Ordered"
                value={formatDate(order.orderedAt)}
              />
              <OrderInfo
                label="Paid"
                value={formatDate(order.paidAt)}
              />
              <OrderInfo
                label="Completed"
                value={formatDate(
                  order.deliveredAt,
                )}
              />
            </div>

            {!delivered && completedItemCount === 0 && (
              <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">
                Your order is not completed yet. Activation codes will appear here after successful payment verification and manual delivery.
              </p>
            )}

            {items.length > 0 && (
              <div className="mt-7 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="track-order-success-heading text-xl font-black">
                    Denomination delivery status
                  </h3>

                  {hasDeliveredCodes && (
                    <DeliveredCodesDownloadButton
                      orderNumber={order.orderNumber}
                      items={items}
                      label="Download All Codes (.txt)"
                      variant="primary"
                      includeItemDetails
                    />
                  )}
                </div>

                {items.map((item, index) => {
                  const itemCompleted = Boolean(item.serviceCompleted) || item.codes.length >= item.quantity;
                  return <article
                    key={`${item.productName}-${item.optionName ?? index}`}
                    className={`rounded-2xl border bg-slate-950 p-5 ${itemCompleted ? "border-emerald-400/20" : "border-amber-400/20"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                    <h4 className="text-lg font-black">
                      {item.productName}
                    </h4>

                    <p className="track-order-accent-text mt-1 text-sm font-bold">
                      Denomination / option: {item.denomination ?? item.optionName ?? item.platform ?? "Standard"}
                    </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.codes.length > 0 && (
                          <DeliveredCodesDownloadButton
                            orderNumber={order.orderNumber}
                            items={[item]}
                            label="Download Codes"
                            variant="primary"
                          />
                        )}
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${itemCompleted ? "track-order-status-success" : "track-order-status-warning"}`}>
                          {itemCompleted ? "COMPLETED" : "PROCESSING"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.platform && (
                        <span className="track-order-platform-tag rounded-full px-3 py-1 text-xs font-bold">
                          Platform: {item.platform}
                        </span>
                      )}

                      {item.region && (
                        <span className="track-order-region-tag rounded-full px-3 py-1 text-xs font-bold">
                          Region: {item.region}
                        </span>
                      )}
                    </div>

                    <DeliveryReceiptLink url={item.receiptUrl ?? undefined} />
                    <details
                      className="mt-4 rounded-xl border border-white/10 p-3"
                      open={item.codes.length === 1}
                    >
                      <summary className="cursor-pointer text-sm font-black text-slate-200">
                        {item.codes.length > 0
                          ? `Show ${item.codes.length} delivered code${item.codes.length === 1 ? "" : "s"}`
                          : item.serviceCompleted ? "UID / account delivery completed" : "Delivery pending"}
                      </summary>
                      <div className="mt-3 space-y-2">
                      {item.codes.map((code) => (
                        <div
                          key={code}
                          className="track-order-code-row flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <code className="track-order-code break-all font-black">
                            {code}
                          </code>

                          <button
                            type="button"
                            onClick={() =>
                              void copyCode(code)
                            }
                            className="track-order-copy-action rounded-lg border px-4 py-2 text-xs font-black transition"
                          >
                            {copiedCode === code
                              ? "Copied"
                              : "Copy"}
                          </button>
                        </div>
                      ))}

                      {item.codes.length === 0 && (
                        <p className="text-sm text-amber-300">
                          {item.serviceCompleted ? "Your UID / account purchase has been completed." : "This denomination is waiting for delivery."}
                        </p>
                      )}
                      </div>
                    </details>
                  </article>;
                })}
              </div>
            )}

            {delivered && (
              <VerifiedPurchaseReview
                orderNumber={order.orderNumber}
              />
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function OrderInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-slate-200">
        {value}
      </p>
    </div>
  );
}
