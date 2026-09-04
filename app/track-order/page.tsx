"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
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
  const [orderNumber, setOrderNumber] =
    useState("");
  const [result, setResult] =
    useState<LookupResult | null>(null);
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] =
    useState("");
  const [verifiedEmail, setVerifiedEmail] =
    useState("");

  useEffect(() => {
    const value = new URLSearchParams(
      window.location.search,
    )
      .get("orderNumber")
      ?.trim();

    if (value) {
      setOrderNumber(value.toUpperCase());
    }
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData(
      event.currentTarget,
    );

    try {
      const response = await fetch(
        "/api/orders/lookup",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderNumber: formData.get(
              "order_number",
            ),
            email: formData.get("email"),
          }),
        },
      );

      const data =
        (await response.json()) as LookupResult;

      if (!response.ok || !data.order) {
        throw new Error(
          data.error ??
            "Unable to find this order.",
        );
      }

      setResult(data);
      setVerifiedEmail(String(formData.get("email") ?? "").trim().toLowerCase());
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Unable to find this order.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
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
            Track Your Order
          </h1>

          <p className="mt-3 max-w-2xl text-slate-400">
            Enter the exact order number and email used during checkout. Delivered codes remain hidden unless both details match.
          </p>
        </div>

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <form
            onSubmit={handleSubmit}
            className="grid gap-5 sm:grid-cols-2"
          >
            <label>
              <span className="text-sm font-bold">
                Order number
              </span>

              <input
                name="order_number"
                type="text"
                value={orderNumber}
                onChange={(event) =>
                  setOrderNumber(
                    event.target.value.toUpperCase(),
                  )
                }
                required
                minLength={8}
                maxLength={100}
                autoComplete="off"
                placeholder="NX-XXXXXXXXXXXX"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 uppercase outline-none transition focus:border-cyan-400"
              />
            </label>

            <label>
              <span className="text-sm font-bold">
                Checkout email
              </span>

              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="customer@example.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none transition focus:border-cyan-400"
              />
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="track-order-primary-action rounded-xl px-6 py-3 font-black transition disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
            >
              {isLoading
                ? "Checking order..."
                : "Check Order"}
            </button>
          </form>

          {error && (
            <p className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
              {error}
            </p>
          )}
        </section>

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
                  const itemCompleted = item.codes.length >= item.quantity;
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

                    <details
                      className="mt-4 rounded-xl border border-white/10 p-3"
                      open={item.codes.length === 1}
                    >
                      <summary className="cursor-pointer text-sm font-black text-slate-200">
                        {item.codes.length > 0
                          ? `Show ${item.codes.length} delivered code${item.codes.length === 1 ? "" : "s"}`
                          : "Delivery pending"}
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
                          This denomination is waiting for delivery.
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
