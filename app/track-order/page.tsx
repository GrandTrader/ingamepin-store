"use client";

import Link from "next/link";
import PurchaseVerification from "@/components/PurchaseVerification";
import DeliveryReceiptLink from "@/components/DeliveryReceiptLink";
import {
  useState,
  useRef,
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

export default function TrackOrderPage() {
  const [result, setResult] =
    useState<LookupResult | null>(null);
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] =
    useState("");
  const [verifiedEmail, setVerifiedEmail] =
    useState("");

  const [verificationRequired, setVerificationRequired] = useState(false);
  const lookupSequence = useRef(0);
  function clearPurchase() { lookupSequence.current++; setIsLoading(false); setResult(null); setVerifiedEmail(""); setVerificationRequired(false); setError(""); }
  async function loadOrder(orderNumber: string, email: string) {
    const sequence = ++lookupSequence.current;
    setIsLoading(true); setError(""); setResult(null); setVerificationRequired(false);
    try {
      const response = await fetch("/api/orders/lookup", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({orderNumber})});
      const data = await response.json() as LookupResult;
      if (sequence !== lookupSequence.current) return;
      if (response.status === 401) { setVerificationRequired(true); setVerifiedEmail(""); }
      if (!response.ok || !data.order) throw Error(data.error || "Unable to find this order.");
      setResult(data); setVerifiedEmail(email);
    } catch (error) { if (sequence === lookupSequence.current) setError(error instanceof Error ? error.message : "Unable to load order."); }
    finally { if (sequence === lookupSequence.current) setIsLoading(false); }
  }

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
    <main className="track-order-page min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7">
          <Link
            href="/"
            className="text-sm font-bold text-cyan-400 transition hover:text-cyan-300"
          >
            ← Return to store
          </Link>

          <p className="mt-7 text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
            Secure order lookup
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Your Purchases
          </h1>

          <p className="mt-3 max-w-2xl text-slate-400">
            View your purchases and copy delivered codes. Guests verify their purchase email once; signed-in customers can continue directly.
          </p>
        </div>

        <PurchaseVerification onSelect={(number, email) => void loadOrder(number, email)} onClear={clearPurchase} verificationRequired={verificationRequired} />
        {isLoading && <p role="status" className="mt-4 text-sm">Loading purchase...</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-400/10 p-4 text-sm text-red-300">{error}</p>}

        {order && (
          <section className="mt-7 rounded-3xl border border-white/10 bg-slate-900 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-sm text-slate-400">
                  Order number
                </p>

                <h2 className="track-order-accent-text mt-1 text-2xl font-black">
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

            <div className="mt-6 grid gap-4 rounded-2xl bg-slate-950 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
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

            {delivered && verifiedEmail && (
              <VerifiedPurchaseReview
                orderNumber={order.orderNumber}
                email={verifiedEmail}
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
