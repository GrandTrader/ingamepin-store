"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPaymentMethod } from "@/lib/payment-method-label";

type InvoiceItem = {
  id: string;
  productName: string;
  optionName: string;
  platform: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type InvoiceOrder = {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  customerEmail: string;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  items: InvoiceItem[];
};

type Payment = {
  method: string;
  status: string;
  transactionId: string;
  verifiedAt: string | null;
};

type BillingDetails = {
  fullName: string;
  country: string;
  address: string;
  taxpayerId: string;
};

type CustomerInvoiceBuilderProps = {
  order: InvoiceOrder;
  payment: Payment;
  countryNames: string[];
  defaultCustomerName: string;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";

function formatMoney(value: number, currency: string) {
  if (currency.toUpperCase() === "USDT") {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function CustomerInvoiceBuilder({
  order,
  payment,
  countryNames,
  defaultCustomerName,
}: CustomerInvoiceBuilderProps) {
  const [billing, setBilling] = useState<BillingDetails | null>(null);

  function generateInvoice(formData: FormData) {
    setBilling({
      fullName: String(formData.get("full_name") ?? "").trim(),
      country: String(formData.get("country") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      taxpayerId: String(formData.get("taxpayer_id") ?? "").trim(),
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-950 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl print:max-w-none">
        <div className="print:hidden">
          <Link
            href="/account/orders"
            className="text-sm font-bold text-cyan-600 hover:text-cyan-500"
          >
            ← Back to my orders
          </Link>

          <header className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
              Customer invoice
            </p>
            <h1 className="mt-2 text-3xl font-black">
              {order.items.length === 1
                ? "Generate product invoice"
                : "Generate full order invoice"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter your billing information for order {order.orderNumber}.
            </p>
          </header>

          <form
            action={generateInvoice}
            className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label>
                <span className="text-sm font-bold">Full legal name</span>
                <input
                  name="full_name"
                  required
                  minLength={2}
                  maxLength={150}
                  defaultValue={defaultCustomerName}
                  className={inputClass}
                />
              </label>

              <label>
                <span className="text-sm font-bold">Country</span>
                <select name="country" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Select country
                  </option>
                  {countryNames.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2">
                <span className="text-sm font-bold">Complete billing address</span>
                <textarea
                  name="address"
                  required
                  minLength={10}
                  maxLength={500}
                  rows={4}
                  placeholder="House/building, street, city, state, postal code"
                  className={inputClass}
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-sm font-bold">
                  Taxpayer Identification Number (optional)
                </span>
                <input
                  name="taxpayer_id"
                  maxLength={100}
                  placeholder="Tax ID / TIN"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Order products, quantities, prices and payment information are filled
              automatically and cannot be changed.
            </div>

            <button
              type="submit"
              className="mt-6 rounded-xl bg-cyan-500 px-6 py-3 font-black text-slate-950 transition hover:bg-cyan-400"
            >
              {order.items.length === 1
                ? "Generate Product Invoice"
                : "Generate Full Order Invoice"}
            </button>
          </form>

          {billing && (
            <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-black text-cyan-950">Invoice ready</h2>
                <p className="mt-1 text-sm text-cyan-700">
                  Review the invoice below before saving it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white hover:bg-cyan-600"
              >
                Print / Save PDF
              </button>
            </section>
          )}
        </div>

        {billing && (
          <CustomerInvoiceDocument
            order={order}
            payment={payment}
            billing={billing}
          />
        )}
      </div>
    </main>
  );
}

function CustomerInvoiceDocument({
  order,
  payment,
  billing,
}: {
  order: InvoiceOrder;
  payment: Payment;
  billing: BillingDetails;
}) {
  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }

          html,
          body {
            width: 210mm;
            min-height: 297mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          #customer-invoice-print,
          #customer-invoice-print * {
            visibility: visible !important;
          }

          #customer-invoice-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 194mm !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          #customer-invoice-print .invoice-header {
            padding: 7mm 8mm !important;
          }

          #customer-invoice-print .invoice-body {
            padding: 6mm 8mm !important;
          }

          #customer-invoice-print .invoice-gap {
            margin-top: 5mm !important;
          }
        }
      `}</style>

      <section
        id="customer-invoice-print"
        className="mx-auto mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl"
      >
        <header className="invoice-header border-b-2 border-blue-600 bg-blue-50 px-7 py-7 sm:px-10">
          <div className="flex justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-black text-white">
                  IP
                </div>
                <div>
                  <p className="text-2xl font-black">AMAN G</p>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                    InGamePIN Digital Game Store
                  </p>
                </div>
              </div>
              <p className="mt-4 max-w-lg text-xs leading-5 text-slate-600">
                Chandpur Leningarh, near Jagorani Sangha Club, South Jogendra
                Nagar, Kolkata, West Bengal 700110, India
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                GSTIN: 19CMAPG4174K1ZV
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">
                Tax invoice
              </p>
              <p className="mt-2 text-lg font-black">AG-{order.invoiceNumber}</p>
              <p className="mt-1 text-xs text-slate-600">
                Issued {formatDate(order.paidAt || order.createdAt)}
              </p>
              <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                {payment.status.replaceAll("_", " ")}
              </span>
            </div>
          </div>
        </header>

        <div className="invoice-body p-7 sm:p-9">
          <div className="grid grid-cols-2 gap-7">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Billed to
              </p>
              <p className="mt-2 text-base font-black">{billing.fullName}</p>
              <p className="mt-1 text-sm text-slate-600">{order.customerEmail}</p>
              {billing.taxpayerId && (
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Taxpayer ID: {billing.taxpayerId}
                </p>
              )}
              <p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-600">
                {billing.address}
                {"\n"}
                {billing.country}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Payment
              </p>
              <p className="mt-2 font-black">{formatPaymentMethod(payment.method)}</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">
                {payment.status.replaceAll("_", " ")}
              </p>
              <p className="mt-1 break-all text-xs text-slate-600">
                {payment.transactionId || "Payment reference recorded"}
              </p>
              {payment.verifiedAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Verified {formatDate(payment.verifiedAt)}
                </p>
              )}
            </div>
          </div>

          <div className="invoice-gap mt-7 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Product / denomination</th>
                  <th className="px-3 py-3 text-center">Qty</th>
                  <th className="px-3 py-3 text-right">Rate</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-3 py-3">
                      <p className="font-bold">{item.productName}</p>
                      <p className="mt-1 text-xs font-semibold text-blue-600">
                        {item.optionName}
                        {item.platform ? ` · ${item.platform}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">{item.quantity}</td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(item.unitPrice, order.currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-black">
                      {formatMoney(item.totalPrice, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="invoice-gap ml-auto mt-6 max-w-sm rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex justify-between gap-4 py-1 text-sm text-slate-600">
              <span>Subtotal</span>
              <strong>{formatMoney(order.subtotal, order.currency)}</strong>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between gap-4 py-1 text-sm text-slate-600">
                <span>Discount</span>
                <strong>-{formatMoney(order.discount, order.currency)}</strong>
              </div>
            )}
            <div className="mt-3 flex justify-between gap-4 border-t border-blue-200 pt-3 text-xl font-black">
              <span>Total</span>
              <span className="text-blue-700">
                {formatMoney(order.total, order.currency)}
              </span>
            </div>
          </div>

          <footer className="invoice-gap mt-7 border-t border-slate-200 pt-5 text-center text-xs leading-5 text-slate-500">
            <p className="font-bold text-slate-700">
              Thank you for choosing InGamePIN.
            </p>
            <p>
              support@ingamepin.com · WhatsApp +91-9073045011 · Telegram
              @ingamepinsupport
            </p>
            <p>This is a computer-generated invoice.</p>
          </footer>
        </div>
      </section>
    </>
  );
}
