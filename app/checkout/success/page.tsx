"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

type LatestOrder = {
  id?: string;
  databaseId?: string;
  orderNumber?: string;
  accessToken?: string;
  totalAmount?: number;
  status?: string;

  customer?: {
    email?: string;
  };

  payment?: {
    transactionId?: string;
    submittedAt?: string;
  };
};

type DeliveredItem = {
  productName: string;
  optionName: string | null;
  denomination: number | null;
  platform: string | null;
  region: string | null;
  codes: string[];
};

type DeliveryResult = {
  order?: {
    orderNumber: string;
    status: string;
    total: number;
    currency: string;
  };

  codes?: DeliveredItem[];
  error?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getRedemptionInstructions(
  platform: string | null,
) {
  const normalizedPlatform =
    platform?.toLowerCase() ?? "";

  if (normalizedPlatform.includes("steam")) {
    return "Open Steam, select Games, choose Activate a Product on Steam, enter the key, and confirm the product details.";
  }

  if (
    normalizedPlatform.includes(
      "playstation",
    )
  ) {
    return "Open PlayStation Store on your console or account, choose Redeem Codes, enter the key, and confirm the correct edition and region.";
  }

  if (normalizedPlatform.includes("xbox")) {
    return "Open the Microsoft Store redeem page or the Store on your Xbox, sign in to the correct account, enter the key, and confirm the product.";
  }

  if (normalizedPlatform.includes("epic")) {
    return "Sign in to your Epic Games account, open Redeem Code, enter the key, and confirm the game before redemption.";
  }

  if (
    normalizedPlatform.includes("nintendo")
  ) {
    return "Open Nintendo eShop, select Enter Code, enter the activation key, and confirm the product and account region.";
  }

  return "Sign in to the matching platform account, open its redeem-code section, enter the activation key, and confirm the product details before redemption.";
}

export default function CheckoutSuccessPage() {
  const [order, setOrder] =
    useState<LatestOrder | null>(null);

  const [delivery, setDelivery] =
    useState<DeliveryResult | null>(null);

  const [isLoaded, setIsLoaded] =
    useState(false);

  const [isChecking, setIsChecking] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [copiedCode, setCopiedCode] =
    useState("");

  const checkDelivery = useCallback(
    async (savedOrder: LatestOrder) => {
      if (
        !savedOrder.databaseId ||
        !savedOrder.accessToken
      ) {
        setMessage(
          "Secure order access information is unavailable.",
        );

        return;
      }

      setIsChecking(true);
      setMessage("");

      try {
        const response = await fetch(
          "/api/orders/delivery",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              orderId:
                savedOrder.databaseId,

              accessToken:
                savedOrder.accessToken,
            }),
          },
        );

        const result =
          (await response.json()) as DeliveryResult;

        if (
          !response.ok ||
          !result.order
        ) {
          throw new Error(
            result.error ??
              "Unable to check delivery.",
          );
        }

        setDelivery(result);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to check delivery.",
        );
      } finally {
        setIsChecking(false);
      }
    },
    [],
  );

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("latestOrder") ??
        localStorage.getItem("pendingOrder");

      const parsed = raw
        ? (JSON.parse(raw) as LatestOrder)
        : null;

      setOrder(parsed);

      if (
        parsed &&
        !localStorage.getItem("latestOrder")
      ) {
        localStorage.setItem(
          "latestOrder",
          JSON.stringify(parsed),
        );
      }

      [
        "shoppingCart",
        "checkoutCart",
        "cart",
        "cartItems",
        "buyNowItem",
        "buyNowProduct",
        "checkoutBuyNow",
        "pendingOrder",
      ].forEach((key) =>
        localStorage.removeItem(key),
      );

      window.dispatchEvent(
        new Event("cartUpdated"),
      );

      if (parsed) {
        void checkDelivery(parsed);
      }
    } catch {
      setOrder(null);
    } finally {
      setIsLoaded(true);
    }
  }, [checkDelivery]);

  useEffect(() => {
    const status = delivery?.order?.status ?? order?.status;
    const orderNumber = delivery?.order?.orderNumber ?? order?.orderNumber ?? order?.id;

    if (!orderNumber || !["PAID", "PROCESSING", "DELIVERED"].includes(status ?? "")) {
      return;
    }

    const conversionKey = `googleAdsPurchase:${orderNumber}`;
    if (localStorage.getItem(conversionKey)) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

    window.gtag("event", "conversion", {
      send_to: "AW-621401578/8SxHCIXE4PEZEOqrp6gC",
      value: Number(delivery?.order?.total ?? order?.totalAmount ?? 0),
      currency: delivery?.order?.currency ?? "USD",
      transaction_id: orderNumber,
    });

    localStorage.setItem(conversionKey, "sent");
  }, [delivery, order]);

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(
      code,
    );

    setCopiedCode(code);

    window.setTimeout(() => {
      setCopiedCode("");
    }, 1500);
  }

  function safeFileName(value: string) {
    return value
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "delivered-codes";
  }

  function downloadTextFile(fileName: string, content: string) {
    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function createDeliveredCodesFile(items: DeliveredItem[]) {
    return items
      .flatMap((item) => item.codes)
      .map((code) => code.trim())
      .filter(Boolean)
      .join("\r\n");
  }

  function downloadProductCodes(item: DeliveredItem) {
    if (item.codes.length === 0) return;

    downloadTextFile(
      `${safeFileName(item.productName)}-codes.txt`,
      createDeliveredCodesFile([item]),
    );
  }

  function downloadAllCodes() {
    const itemsWithCodes = deliveredItems.filter((item) => item.codes.length > 0);

    if (itemsWithCodes.length === 0) return;

    const orderNumber =
      delivery?.order?.orderNumber ?? order?.orderNumber ?? order?.id ?? "order";

    downloadTextFile(
      `${safeFileName(orderNumber)}-delivered-codes.txt`,
      createDeliveredCodesFile(itemsWithCodes),
    );
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-8 text-white sm:px-5 sm:py-16">
        <div className="mx-auto h-64 max-w-4xl animate-pulse rounded-3xl bg-white/5" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-10 text-white sm:px-5 sm:py-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 text-center sm:rounded-3xl sm:p-9">
          <h1 className="text-3xl font-black">
            Order not found
          </h1>

          <p className="mt-3 text-slate-400">
            This browser does not contain
            your secure order information.
          </p>

          <Link
            href="/"
            className="mt-7 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950"
          >
            Return to Store
          </Link>
        </div>
      </main>
    );
  }

  const liveStatus =
    delivery?.order?.status ??
    order.status ??
    "PAYMENT_REVIEW";

  const delivered =
    liveStatus === "DELIVERED";

  const rejected =
    liveStatus === "CANCELLED";

  const processing =
    liveStatus === "PROCESSING" ||
    liveStatus === "PAID";

  const deliveredItems =
    delivery?.codes ?? [];

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 sm:rounded-3xl">
          <div
            className={`border-b border-white/10 px-4 py-7 text-center sm:px-6 sm:py-10 ${
              delivered
                ? "bg-emerald-400/10"
                : rejected
                  ? "bg-red-400/10"
                  : "bg-amber-400/10"
            }`}
          >
            <p
              className={`text-xs font-bold uppercase tracking-[0.25em] ${
                delivered
                  ? "text-emerald-400"
                  : rejected
                    ? "text-red-300"
                    : "text-amber-300"
              }`}
            >
              {delivered
                ? "Order Completed"
                : rejected
                  ? "Payment Rejected"
                  : processing
                    ? "Payment Verified · Processing"
                    : "Verification Pending"}
            </p>

            <h1 className="mt-3 text-2xl font-black sm:text-4xl">
              {delivered
                ? "Your Digital Product Is Ready"
                : rejected
                  ? "Please Contact Support"
                  : processing
                    ? "We Are Preparing Your Order"
                    : "Thank You for Your Order"}
            </h1>

            <p className="mx-auto mt-3 max-w-2xl text-slate-400">
              {delivered
                ? "Payment is verified. Your private codes are displayed below."
                : rejected
                  ? "The submitted payment could not be verified. No code was released."
                  : processing
                    ? "Your payment is confirmed. InGamePin is manually preparing your digital products and will email you after completion."
                    : "Your payment is being reviewed manually. No code will be released before approval."}
            </p>
          </div>

          <div className="p-4 sm:p-8">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-slate-950 p-4 text-xs sm:gap-4 sm:p-5 sm:text-sm">
              <Info
                label="Order number"
                value={
                  delivery?.order
                    ?.orderNumber ??
                  order.orderNumber ??
                  order.id ??
                  "Not available"
                }
              />

              <Info
                label="Amount"
                value={formatPrice(
                  Number(
                    delivery?.order?.total ??
                      order.totalAmount ??
                      0,
                  ),
                )}
              />

              <Info
                label="Transaction / UTR"
                value={
                  order.payment
                    ?.transactionId ??
                  "Not available"
                }
              />

              <Info
                label="Submitted"
                value={formatDate(
                  order.payment
                    ?.submittedAt,
                )}
              />

              <Info
                label="Status"
                value={liveStatus.replaceAll(
                  "_",
                  " ",
                )}
              />

              <Info
                label="Customer email"
                value={
                  order.customer?.email ??
                  "Not available"
                }
              />
            </div>

            {delivered && (
              <section className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4 sm:mt-7 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="text-xl font-black text-emerald-300">
                      Secure digital delivery
                    </h2>

                    <p className="mt-2 text-sm text-slate-400">
                      Keep these codes private.
                      Each code can normally be
                      redeemed only once.
                    </p>
                  </div>

                  {deliveredItems.some((item) => item.codes.length > 0) && (
                    <button
                      type="button"
                      onClick={downloadAllCodes}
                      className="shrink-0 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
                    >
                      Download All Codes (.txt)
                    </button>
                  )}
                </div>

                <div className="mt-5 space-y-5">
                  {deliveredItems.map(
                    (item, itemIndex) => (
                      <div
                        key={`${item.productName}-${itemIndex}`}
                        className="rounded-xl bg-slate-950 p-4"
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <p className="font-bold">
                            {item.productName}
                          </p>

                          {item.codes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => downloadProductCodes(item)}
                              className="shrink-0 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/10"
                            >
                              Download Product Codes
                            </button>
                          )}
                        </div>

                        {item.optionName && (
                          <p className="mt-1 text-sm text-cyan-300">
                            Edition / option:{" "}
                            {item.optionName}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.platform && (
                            <span className="rounded-full bg-violet-400/10 px-3 py-1 text-xs font-bold text-violet-300">
                              Platform: {item.platform}
                            </span>
                          )}

                          {item.region && (
                            <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-bold text-blue-300">
                              Region: {item.region}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 space-y-2">
                          {item.codes.map(
                            (code) => (
                              <div
                                key={code}
                                className="flex flex-col gap-3 rounded-lg border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <code className="break-all font-bold text-cyan-300">
                                  {code}
                                </code>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyCode(
                                      code,
                                    )
                                  }
                                  className="shrink-0 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/10"
                                >
                                  {copiedCode ===
                                  code
                                    ? "Copied"
                                    : "Copy"}
                                </button>
                              </div>
                            ),
                          )}

                          {item.codes.length ===
                            0 && (
                            <p className="text-sm text-amber-300">
                              Delivery for this
                              item requires manual
                              processing.
                            </p>
                          )}
                        </div>

                        {item.codes.length > 0 && (
                          <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-slate-300">
                            <p className="font-bold text-amber-300">
                              How to redeem
                            </p>

                            <p className="mt-1 leading-6">
                              {getRedemptionInstructions(
                                item.platform,
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            {message && (
              <p className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                {message}
              </p>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {!delivered &&
                !rejected && (
                  <button
                    type="button"
                    disabled={isChecking}
                    onClick={() =>
                      void checkDelivery(
                        order,
                      )
                    }
                    className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
                  >
                    {isChecking
                      ? "Checking..."
                      : "Check Delivery Status"}
                  </button>
                )}

              <Link
                href="/"
                className="rounded-xl border border-white/15 px-5 py-3 text-center font-bold transition hover:border-cyan-400 hover:text-cyan-400"
              >
                Continue Shopping
              </Link>

              <Link
                href="/support"
                className="rounded-xl border border-white/15 px-5 py-3 text-center font-bold transition hover:border-cyan-400 hover:text-cyan-400"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({
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

      <p className="mt-1 break-all font-bold text-slate-200">
        {value}
      </p>
    </div>
  );
}
