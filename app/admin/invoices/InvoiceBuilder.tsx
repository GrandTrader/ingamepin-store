"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  category_id: string;
};

type ProductOption = {
  id: string;
  product_id: string;
  option_name: string;
  denomination: number | string | null;
  denomination_currency: string | null;
  sort_order: number;
};

type InvoiceBuilderProps = {
  categories: Category[];
  products: Product[];
  options: ProductOption[];
  countryNames: string[];
  defaultInvoiceNumber: string;
  defaultInvoiceDate: string;
};

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerEmail: string;
  customerCountry: string;
  customerTaxpayerId: string;
  customerAddress: string;
  categoryName: string;
  productName: string;
  optionName: string;
  quantity: number;
  unitPrice: number;
  paymentStatus: string;
  network: string;
  transactionId: string;
  notes: string;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function formatUsdt(amount: number) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}

function formatDate(value: string) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatOption(option: ProductOption) {
  const amount =
    option.denomination === null
      ? ""
      : Number(option.denomination).toLocaleString("en-US");
  const denomination = [amount, option.denomination_currency]
    .filter(Boolean)
    .join(" ");

  return denomination
    ? `${option.option_name} — ${denomination}`
    : option.option_name;
}

export default function InvoiceBuilder({
  categories,
  products,
  options,
  countryNames,
  defaultInvoiceNumber,
  defaultInvoiceDate,
}: InvoiceBuilderProps) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const availableProducts = useMemo(
    () => products.filter((product) => product.category_id === categoryId),
    [categoryId, products],
  );
  const [productId, setProductId] = useState("");
  const [optionId, setOptionId] = useState("");
  const availableOptions = useMemo(
    () => options.filter((option) => option.product_id === productId),
    [options, productId],
  );
  const [preview, setPreview] = useState<InvoiceData | null>(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    setProductId("");
    setOptionId("");
  }

  function handleProductChange(value: string) {
    setProductId(value);
    setOptionId("");
  }

  function generatePreview(formData: FormData) {
    const selectedCategory = categories.find(
      (category) => category.id === String(formData.get("category_id") ?? ""),
    );
    const selectedProduct = products.find(
      (product) => product.id === String(formData.get("product_id") ?? ""),
    );
    const selectedOption = options.find(
      (option) => option.id === String(formData.get("product_option_id") ?? ""),
    );

    setSavedInvoiceId("");
    setSaveError("");
    setPreview({
      invoiceNumber: String(formData.get("invoice_number") ?? "").trim(),
      invoiceDate: String(formData.get("invoice_date") ?? ""),
      customerName: String(formData.get("customer_name") ?? "").trim(),
      customerEmail: String(formData.get("customer_email") ?? "").trim(),
      customerCountry: String(formData.get("customer_country") ?? "").trim(),
      customerTaxpayerId: String(
        formData.get("customer_taxpayer_id") ?? "",
      ).trim(),
      customerAddress: String(formData.get("customer_address") ?? "").trim(),
      categoryName: selectedCategory?.name ?? "Uncategorized",
      productName: selectedProduct?.name ?? "Selected product",
      optionName: selectedOption ? formatOption(selectedOption) : "Standard option",
      quantity: Math.max(1, Number(formData.get("quantity") ?? 1)),
      unitPrice: Math.max(0, Number(formData.get("unit_price") ?? 0)),
      paymentStatus: String(formData.get("payment_status") ?? "PAID"),
      network: String(formData.get("network") ?? "").trim(),
      transactionId: String(formData.get("transaction_id") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
    });
  }

  async function saveAndPrint() {
    if (!preview || isSaving) return;

    setIsSaving(true);
    setSaveError("");

    try {
      let invoiceId = savedInvoiceId;

      if (!invoiceId) {
        const response = await fetch("/api/admin/invoices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(preview),
        });
        const result = (await response.json()) as {
          id?: string;
          error?: string;
        };

        if (!response.ok || !result.id) {
          throw new Error(result.error ?? "Unable to save the invoice.");
        }

        invoiceId = result.id;
        setSavedInvoiceId(invoiceId);
      }

      window.print();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save the invoice.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="print:hidden">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
              Direct sales
            </p>
            <h1 className="mt-2 text-3xl font-black">Create invoice</h1>
            <p className="mt-1 text-sm text-slate-500">
              Select an existing product and enter the agreed USDT price manually.
            </p>
          </div>
          <Link
            href="/admin/invoices/history"
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
          >
            Invoice history
          </Link>
        </header>

        <form
          action={generatePreview}
          className="mt-8 grid gap-6 xl:grid-cols-2"
        >
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Invoice details</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold">Invoice number</span>
                <input
                  name="invoice_number"
                  required
                  defaultValue={defaultInvoiceNumber}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Invoice date</span>
                <input
                  name="invoice_date"
                  type="date"
                  required
                  defaultValue={defaultInvoiceDate}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Payment status</span>
                <select name="payment_status" className={inputClass} defaultValue="PAID">
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold">USDT network</span>
                <select name="network" className={inputClass} defaultValue="TRC20">
                  <option value="TRC20">TRC20</option>
                  <option value="BEP20">BEP20</option>
                  <option value="ERC20">ERC20</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-bold">Transaction ID / hash</span>
              <input
                name="transaction_id"
                placeholder="Optional blockchain transaction hash"
                className={inputClass}
              />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Customer details</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold">Customer name</span>
                <input name="customer_name" required className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Customer email</span>
                <input
                  name="customer_email"
                  type="email"
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Country</span>
                <select
                  name="customer_country"
                  required
                  defaultValue=""
                  className={inputClass}
                >
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
              <label className="block">
                <span className="text-sm font-bold">
                  Taxpayer Identification Number
                </span>
                <input
                  name="customer_taxpayer_id"
                  maxLength={100}
                  placeholder="Optional tax ID / TIN"
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold">Billing address</span>
                <textarea
                  name="customer_address"
                  rows={3}
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 sm:p-6">
            <h2 className="text-xl font-black">Product and price</h2>
            <p className="mt-1 text-sm text-slate-500">
              The product comes from your store, but this invoice price is entered manually.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              <label className="block">
                <span className="text-sm font-bold">Category</span>
                <select
                  name="category_id"
                  required
                  value={categoryId}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className={inputClass}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold">Product</span>
                <select
                  name="product_id"
                  required
                  value={productId}
                  onChange={(event) => handleProductChange(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Select product</option>
                  {availableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold">Denomination / option</span>
                <select
                  name="product_option_id"
                  required
                  value={optionId}
                  onChange={(event) => setOptionId(event.target.value)}
                  disabled={!productId || availableOptions.length === 0}
                  className={inputClass}
                >
                  <option value="">
                    {!productId
                      ? "Select product first"
                      : availableOptions.length === 0
                        ? "No denomination available"
                        : "Select denomination"}
                  </option>
                  {availableOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {formatOption(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold">Quantity</span>
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue="1"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold">Manual price (USDT)</span>
                <input
                  name="unit_price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="100.00"
                  className={inputClass}
                />
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-bold">Invoice note</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="Optional payment or delivery note"
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              disabled={
                categories.length === 0 ||
                availableProducts.length === 0 ||
                !productId ||
                availableOptions.length === 0
              }
              className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
            >
              Preview Invoice
            </button>
          </section>
        </form>

        {preview && (
          <section className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-black text-blue-950">Invoice ready</h2>
                <p className="mt-1 text-sm text-blue-700">
                  Save the invoice permanently, then print or download its PDF.
                </p>
                {savedInvoiceId && (
                  <Link
                    href={`/admin/invoices/${savedInvoiceId}`}
                    className="mt-2 inline-block text-sm font-black text-emerald-700 underline"
                  >
                    Saved successfully — open invoice record
                  </Link>
                )}
                {saveError && (
                  <p className="mt-2 text-sm font-bold text-red-600">{saveError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void saveAndPrint()}
                disabled={isSaving}
                className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white hover:bg-blue-600"
              >
                {isSaving ? "Saving…" : "Save Invoice & Print / PDF"}
              </button>
            </div>
          </section>
        )}
      </div>

      {preview && <InvoicePreview invoice={preview} />}
    </>
  );
}

export function InvoicePreview({ invoice }: { invoice: InvoiceData }) {
  const total = invoice.quantity * invoice.unitPrice;

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

          #invoice-print-area,
          #invoice-print-area * {
            visibility: visible !important;
          }

          #invoice-print-area {
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

          #invoice-print-area .invoice-header {
            padding: 7mm 8mm !important;
          }

          #invoice-print-area .invoice-body {
            padding: 7mm 8mm !important;
          }

          #invoice-print-area .invoice-section-gap {
            margin-top: 5mm !important;
          }

          #invoice-print-area .invoice-footer {
            margin-top: 6mm !important;
            padding-top: 4mm !important;
          }
        }
      `}</style>

      <section
        id="invoice-print-area"
        className="mx-auto mt-8 max-w-[900px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl"
      >
      <div className="invoice-header border-b-2 border-blue-600 bg-blue-50 px-7 py-7 sm:px-10">
        <div className="flex justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-black text-white">
                IP
              </div>
              <div>
                <p className="text-2xl font-black text-slate-950">AMAN G</p>
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
            <p className="mt-2 text-xl font-black text-slate-950">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Issued {formatDate(invoice.invoiceDate)}
            </p>
            <span
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                invoice.paymentStatus === "PAID"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {invoice.paymentStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="invoice-body p-7 sm:p-9">
        <div className="grid grid-cols-2 gap-7">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Billed to
            </p>
            <p className="mt-2 text-base font-black">{invoice.customerName}</p>
            <p className="mt-1 text-sm text-slate-600">{invoice.customerEmail}</p>
            {invoice.customerTaxpayerId && (
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Taxpayer ID: {invoice.customerTaxpayerId}
              </p>
            )}
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
              {[invoice.customerAddress, invoice.customerCountry]
                .filter(Boolean)
                .join("\n")}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Payment
            </p>
            <p className="mt-3 font-black">USDT {invoice.network}</p>
            <p className="mt-1 break-all text-sm text-slate-600">
              {invoice.transactionId || "Transaction reference not recorded"}
            </p>
          </div>
        </div>

        <div className="invoice-section-gap mt-7 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3">Product / denomination</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200">
                <td className="px-4 py-5">
                  <p className="font-bold">{invoice.productName}</p>
                  <p className="mt-1 text-xs font-semibold text-blue-600">
                    {invoice.optionName}
                  </p>
                </td>
                <td className="px-4 py-4 text-slate-600">
                  {invoice.categoryName}
                </td>
                <td className="px-4 py-4 text-center">{invoice.quantity}</td>
                <td className="px-4 py-4 text-right">
                  {formatUsdt(invoice.unitPrice)}
                </td>
                <td className="px-4 py-4 text-right font-black">
                  {formatUsdt(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="invoice-section-gap ml-auto mt-6 max-w-sm rounded-xl border border-blue-200 bg-blue-50 p-4 text-slate-900">
          <div className="flex justify-between gap-4 text-sm text-slate-600">
            <span>Subtotal</span>
            <span>{formatUsdt(total)}</span>
          </div>
          <div className="mt-3 flex justify-between gap-4 border-t border-blue-200 pt-3 text-xl font-black">
            <span>Total</span>
            <span className="text-blue-700">{formatUsdt(total)}</span>
          </div>
          <p className="mt-1 text-right text-xs text-slate-500">
            Crypto conversion rate is not shown.
          </p>
        </div>

        {invoice.notes && (
          <div className="invoice-section-gap mt-6 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Notes
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
              {invoice.notes}
            </p>
          </div>
        )}

        <footer className="invoice-footer mt-8 border-t border-slate-200 pt-5 text-center text-xs leading-5 text-slate-500">
          <p className="font-bold text-slate-700">Thank you for choosing InGamePIN.</p>
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
