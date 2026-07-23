"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OrderItem = {
  id?: string;
  cartId?: string;
  name?: string;
  title?: string;
  productName?: string;
  image?: string;
  denomination?: number | string;
  amount?: number | string;
  price?: number;
  unitPrice?: number;
  quantity?: number;
};

type PendingOrder = {
  id: string;
  databaseId?: string;
  orderNumber?: string;
  accessToken?: string;
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  items: OrderItem[];
  paymentMethod?: string;
  subtotal: number;
  shippingCharge: number;
  totalAmount: number;
  deliveryMethod?: string;
  status?: string;
  createdAt?: string;
};

const UPI_ID = "AGAMAN315@iob";
const QR_IMAGE_PATH = "/images/upi-qr.jpeg";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getItemName(item: OrderItem) {
  return item.name || item.title || item.productName || "Digital Product";
}

function getItemPrice(item: OrderItem) {
  return Number(item.price ?? item.unitPrice ?? 0);
}

function getItemQuantity(item: OrderItem) {
  return Math.max(1, Number(item.quantity || 1));
}

export default function PaymentPage() {
  const router = useRouter();

  const [order, setOrder] = useState<PendingOrder | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [paymentScreenshot, setPaymentScreenshot] =
    useState<File | null>(null);
  const [screenshotName, setScreenshotName] = useState("");
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function openBinancePay() {
    if (!order?.databaseId || !order.accessToken) {
      setMessage("Secure order information is unavailable.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/binance-pay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.databaseId,
          accessToken: order.accessToken,
        }),
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error ?? "Unable to open Binance Pay.");
      }

      localStorage.setItem("latestOrder", JSON.stringify(order));
      window.location.href = result.checkoutUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open Binance Pay.");
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem("pendingOrder");

      if (!savedOrder) {
        setOrder(null);
        return;
      }

      const parsedOrder = JSON.parse(savedOrder) as PendingOrder;

      if (
        !parsedOrder ||
        !Array.isArray(parsedOrder.items) ||
        parsedOrder.items.length === 0 ||
        Number(parsedOrder.totalAmount) <= 0
      ) {
        setOrder(null);
        return;
      }

      setOrder(parsedOrder);
    } catch {
      setOrder(null);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (screenshotPreview) {
        URL.revokeObjectURL(screenshotPreview);
      }
    };
  }, [screenshotPreview]);

  const calculatedSubtotal = useMemo(() => {
    if (!order) {
      return 0;
    }

    return order.items.reduce((total, item) => {
      return total + getItemPrice(item) * getItemQuantity(item);
    }, 0);
  }, [order]);

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      setMessage("");

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setMessage(`Please copy the UPI ID manually: ${UPI_ID}`);
    }
  }

  function handleScreenshot(event: ChangeEvent<HTMLInputElement>) {
    setMessage("");

    const file = event.target.files?.[0];

    if (!file) {
      setPaymentScreenshot(null);
      setScreenshotName("");
      setScreenshotPreview("");
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setPaymentScreenshot(null);
      setScreenshotName("");
      setMessage("Please upload a JPG, PNG, or WEBP image.");
      event.target.value = "";
      return;
    }

    const maximumSize = 5 * 1024 * 1024;

    if (file.size > maximumSize) {
      setPaymentScreenshot(null);
      setScreenshotName("");
      setMessage("Payment screenshot must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }

    setPaymentScreenshot(file);
    setScreenshotName(file.name);
    setScreenshotPreview(URL.createObjectURL(file));
  }

  function validatePayment() {
    const cleanTransactionId = transactionId.trim();

    if (!cleanTransactionId) {
      return "Please enter the UPI transaction or UTR number.";
    }

    if (cleanTransactionId.length < 6) {
      return "Please enter a valid transaction or UTR number.";
    }

    if (!paymentScreenshot) {
      return "Please upload your payment screenshot.";
    }

    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!order) {
      setMessage("Order information is unavailable.");
      return;
    }

    const validationError = validatePayment();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    if (!order.databaseId || !paymentScreenshot) {
      setMessage(
        "Secure order information or payment screenshot is unavailable."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const submissionData = new FormData();

      submissionData.set("orderId", order.databaseId);
      submissionData.set(
        "orderNumber",
        order.orderNumber ?? order.id
      );
      submissionData.set(
        "customerEmail",
        order.customer?.email ?? ""
      );
      submissionData.set(
        "transactionId",
        transactionId.trim()
      );
      submissionData.set("screenshot", paymentScreenshot);

      const response = await fetch("/api/payments/manual", {
        method: "POST",
        body: submissionData,
      });

      const result = (await response.json()) as {
        submission?: {
          orderId: string;
          orderNumber: string;
          orderStatus: string;
          paymentStatus: string;
          submittedAt: string;
        };
        error?: string;
      };

      if (!response.ok || !result.submission) {
        throw new Error(
          result.error ??
            "Unable to submit payment details."
        );
      }

      const paymentSubmission = {
        orderId: order.databaseId,
        orderNumber: result.submission.orderNumber,
        upiId: UPI_ID,
        paymentMethod: "UPI",
        transactionId: transactionId.trim().toUpperCase(),
        screenshotName,
        amount: order.totalAmount,
        status: result.submission.paymentStatus,
        submittedAt: result.submission.submittedAt,
      };

      const updatedOrder = {
        ...order,
        status: result.submission.orderStatus,
        payment: paymentSubmission,
      };

      localStorage.setItem(
        "paymentSubmission",
        JSON.stringify(paymentSubmission)
      );

      localStorage.setItem(
        "pendingOrder",
        JSON.stringify(updatedOrder)
      );

      localStorage.setItem(
        "latestOrder",
        JSON.stringify(updatedOrder)
      );

      router.push("/checkout/success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit payment details. Please try again."
      );
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-8 text-white sm:px-5 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="h-64 animate-pulse rounded-3xl bg-white/5" />
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-10 text-white sm:px-5 sm:py-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 text-center sm:rounded-3xl sm:p-10">
          <div className="text-5xl">💳</div>

          <h1 className="mt-5 text-3xl font-black">
            No pending order found
          </h1>

          <p className="mt-3 text-slate-400">
            Complete the checkout details before opening the payment page.
          </p>

          <Link
            href="/checkout"
            className="mt-7 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950 transition hover:bg-cyan-300"
          >
            Return to Checkout
          </Link>
        </div>
      </main>
    );
  }

  if (order.paymentMethod?.toLowerCase().includes("binance")) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-10 text-white sm:px-5 sm:py-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 text-center sm:rounded-3xl sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Binance Pay</p>
          <h1 className="mt-3 text-3xl font-black">Pay securely with Binance</h1>
          <p className="mt-3 text-slate-400">
            Binance will calculate the supported cryptocurrency amount from your INR order total.
          </p>
          <div className="mt-6 rounded-2xl bg-slate-950 p-5">
            <p className="text-sm text-slate-500">Order total</p>
            <p className="mt-2 text-3xl font-black text-cyan-400">{formatPrice(order.totalAmount)}</p>
          </div>
          {message && <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{message}</p>}
          <button
            type="button"
            onClick={() => void openBinancePay()}
            disabled={isSubmitting}
            className="mt-6 w-full rounded-xl bg-amber-300 px-5 py-4 font-black text-slate-950 disabled:opacity-60"
          >
            {isSubmitting ? "Opening Binance Pay..." : "Continue to Binance Pay"}
          </button>
          <Link href="/checkout" className="mt-4 block text-sm font-bold text-slate-400 hover:text-cyan-300">
            Return to checkout
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:flex-wrap sm:gap-4 sm:px-5 sm:py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
              Secure UPI Payment
            </p>

            <h1 className="mt-1 text-2xl font-black">
              Complete Your Payment
            </h1>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm">
            <span className="text-slate-500">Order ID: </span>
            <span className="font-bold text-white">{order.id}</span>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3 overflow-x-auto text-sm">
            <div className="flex shrink-0 items-center gap-2 text-emerald-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-xs font-black text-slate-950">
                ✓
              </span>
              Details
            </div>

            <div className="h-px min-w-8 flex-1 bg-emerald-400/30" />

            <div className="flex shrink-0 items-center gap-2 font-semibold text-cyan-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-slate-950">
                2
              </span>
              Payment
            </div>

            <div className="h-px min-w-8 flex-1 bg-white/10" />

            <div className="flex shrink-0 items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs">
                3
              </span>
              Confirmation
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-5 sm:gap-7 sm:px-5 sm:py-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:rounded-3xl sm:p-7">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-2xl">
                📱
              </span>

              <div>
                <h2 className="text-xl font-black">Pay with UPI</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Scan the QR code using Google Pay, PhonePe, Paytm, BHIM,
                  or any other UPI application.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[270px] rounded-2xl bg-white p-3 sm:max-w-none sm:p-4">
                <div className="relative mx-auto aspect-square w-full max-w-[240px] overflow-hidden rounded-xl sm:max-w-[330px]">
                  <Image
                    src={QR_IMAGE_PATH}
                    alt={`UPI QR code for ${UPI_ID}`}
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, 360px"
                    className="object-contain"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                    Amount to Pay
                  </p>

                  <p className="mt-2 text-3xl font-black sm:text-4xl">
                    {formatPrice(order.totalAmount)}
                  </p>

                  <p className="mt-2 text-sm text-slate-400">
                    Pay the exact amount shown above.
                  </p>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    UPI ID
                  </p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="break-all text-lg font-black text-white">
                      {UPI_ID}
                    </p>

                    <button
                      type="button"
                      onClick={copyUpiId}
                      className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
                    >
                      {copied ? "Copied!" : "Copy UPI ID"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">
                  Add the order ID <strong>{order.id}</strong> in the UPI
                  payment note whenever your payment application supports it.
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:rounded-3xl sm:p-7">
            <div>
              <h2 className="text-xl font-black">
                Submit Payment Details
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-400">
                After paying, enter the transaction number and upload the
                successful payment screenshot.
              </p>
            </div>

            <div className="mt-6">
              <label
                htmlFor="transactionId"
                className="mb-2 block text-sm font-semibold text-slate-200"
              >
                UPI Transaction / UTR Number
                <span className="ml-1 text-red-400">*</span>
              </label>

              <input
                id="transactionId"
                type="text"
                value={transactionId}
                onChange={(event) =>
                  setTransactionId(
                    event.target.value
                      .replace(/[^a-zA-Z0-9]/g, "")
                      .slice(0, 40)
                  )
                }
                placeholder="Enter transaction or UTR number"
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
              />
            </div>

            <div className="mt-5">
              <label
                htmlFor="paymentScreenshot"
                className="mb-2 block text-sm font-semibold text-slate-200"
              >
                Payment Screenshot
                <span className="ml-1 text-red-400">*</span>
              </label>

              <label
                htmlFor="paymentScreenshot"
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-slate-950 px-4 py-6 text-center transition hover:border-cyan-400/60 sm:px-5 sm:py-8"
              >
                <span className="text-4xl">📤</span>

                <span className="mt-3 font-bold text-white">
                  {screenshotName || "Choose payment screenshot"}
                </span>

                <span className="mt-2 text-xs text-slate-500">
                  JPG, PNG, or WEBP • Maximum 5 MB
                </span>

                <input
                  id="paymentScreenshot"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleScreenshot}
                  className="sr-only"
                />
              </label>
            </div>

            {screenshotPreview && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950 p-4">
                <p className="mb-3 text-sm font-bold">
                  Screenshot preview
                </p>

                <img
                  src={screenshotPreview}
                  alt="Payment screenshot preview"
                  className="max-h-80 w-full rounded-xl object-contain"
                />
              </div>
            )}

            {message && (
              <p
                aria-live="polite"
                className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-4 text-base font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Submitting Payment..."
                : "Submit Payment for Verification"}
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-slate-500">
              Your order will be processed after the payment is manually
              verified.
            </p>
          </section>
        </form>

        <aside>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 sm:rounded-3xl sm:p-5 lg:sticky lg:top-24">
            <h2 className="text-xl font-black">Order Summary</h2>

            <div className="mt-5 max-h-80 space-y-4 overflow-y-auto pr-1">
              {order.items.map((item, index) => {
                const quantity = getItemQuantity(item);
                const price = getItemPrice(item);

                return (
                  <div
                    key={item.id || item.cartId || `${getItemName(item)}-${index}`}
                    className="flex gap-3 border-b border-white/10 pb-4"
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={getItemName(item)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🎮</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-bold">
                        {getItemName(item)}
                      </h3>

                      {(item.denomination || item.amount) && (
                        <p className="mt-1 text-xs text-slate-500">
                          Value: ₹{item.denomination || item.amount}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          Qty: {quantity}
                        </span>

                        <span className="font-bold text-white">
                          {formatPrice(price * quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="text-white">
                  {formatPrice(order.subtotal || calculatedSubtotal)}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Delivery</span>
                <span
                  className={
                    Number(order.shippingCharge || 0) === 0
                      ? "font-semibold text-emerald-400"
                      : "text-white"
                  }
                >
                  {Number(order.shippingCharge || 0) === 0
                    ? "FREE"
                    : formatPrice(order.shippingCharge)}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Taxes</span>
                <span className="text-white">Included</span>
              </div>
            </div>

            <div className="my-5 border-t border-white/10" />

            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-bold">Amount Payable</p>
                <p className="mt-1 text-xs text-slate-500">
                  Use the exact amount
                </p>
              </div>

              <p className="text-2xl font-black text-cyan-400">
                {formatPrice(order.totalAmount)}
              </p>
            </div>

            <div className="mt-5 rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-400">
              <p>
                <span className="font-bold text-white">Customer:</span>{" "}
                {order.customer?.fullName || "Not available"}
              </p>

              <p className="mt-1 break-all">
                <span className="font-bold text-white">Email:</span>{" "}
                {order.customer?.email || "Not available"}
              </p>
            </div>

            <Link
              href="/checkout"
              className="mt-5 block w-full rounded-xl border border-white/15 px-5 py-3.5 text-center font-bold transition hover:border-cyan-400 hover:text-cyan-400"
            >
              Back to Checkout
            </Link>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-950 px-2 py-3 text-center text-xs text-slate-400">
                Secure
              </div>

              <div className="rounded-lg bg-slate-950 px-2 py-3 text-center text-xs text-slate-400">
                UPI
              </div>

              <div className="rounded-lg bg-slate-950 px-2 py-3 text-center text-xs text-slate-400">
                Verified
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
