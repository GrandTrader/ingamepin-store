"use client";

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
  defaultInvoiceNumber: string;
  defaultInvoiceDate: string;
};

type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerEmail: string;
  customerCountry: string;
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

    setPreview({
      invoiceNumber: String(formData.get("invoice_number") ?? "").trim(),
      invoiceDate: String(formData.get("invoice_date") ?? ""),
      customerName: String(formData.get("customer_name") ?? "").trim(),
      customerEmail: String(formData.get("customer_email") ?? "").trim(),
      customerCountry: String(formData.get("customer_country") ?? "").trim(),
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

  return (
    <>
      <div className="print:hidden">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
            Direct sales
          </p>
          <h1 className="mt-2 text-3xl font-black">Create invoice</h1>
          <p className="mt-1 text-sm text-slate-500">
            Select an existing product and enter the agreed USDT price manually.
          </p>
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
                <input name="customer_country" required className={inputClass} />
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
                  Review the preview below, then print or save it as PDF.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white hover:bg-blue-600"
              >
                Print / Save PDF
              </button>
            </div>
          </section>
        )}
      </div>

      {preview && <InvoicePreview invoice={preview} />}
    </>
  );
}

function InvoicePreview({ invoice }: { invoice: InvoiceData }) {
  const total = invoice.quantity * invoice.unitPrice;

  return (
    <section className="mx-auto mt-8 max-w-[900px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl print:mt-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <div className="bg-slate-950 px-7 py-8 text-white sm:px-10">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400 text-xl font-black text-slate-950">
                IP
              </div>
              <div>
                <p className="text-2xl font-black">AMAN G</p>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                  InGamePIN Digital Game Store
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-lg text-sm leading-6 text-slate-300">
              Chandpur Leningarh, near Jagorani Sangha Club, South Jogendra
              Nagar, Kolkata, West Bengal 700110, India
            </p>
            <p className="mt-2 text-sm text-slate-300">GSTIN: 19CMAPG4174K1ZV</p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
              Tax invoice
            </p>
            <p className="mt-3 text-2xl font-black">{invoice.invoiceNumber}</p>
            <p className="mt-2 text-sm text-slate-300">
              Issued {formatDate(invoice.invoiceDate)}
            </p>
            <span
              className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                invoice.paymentStatus === "PAID"
                  ? "bg-emerald-400 text-emerald-950"
                  : "bg-amber-300 text-amber-950"
              }`}
            >
              {invoice.paymentStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="p-7 sm:p-10">
        <div className="grid gap-7 sm:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Billed to
            </p>
            <p className="mt-3 text-lg font-black">{invoice.customerName}</p>
            <p className="mt-1 text-sm text-slate-600">{invoice.customerEmail}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
              {[invoice.customerAddress, invoice.customerCountry]
                .filter(Boolean)
                .join("\n")}
            </p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Payment
            </p>
            <p className="mt-3 font-black">USDT {invoice.network}</p>
            <p className="mt-1 break-all text-sm text-slate-600">
              {invoice.transactionId || "Transaction reference not recorded"}
            </p>
          </div>
        </div>

        <div className="mt-9 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3">Product / denomination</th>
                <th className="hidden px-4 py-3 sm:table-cell">Category</th>
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
                <td className="hidden px-4 py-5 text-slate-600 sm:table-cell">
                  {invoice.categoryName}
                </td>
                <td className="px-4 py-5 text-center">{invoice.quantity}</td>
                <td className="px-4 py-5 text-right">
                  {formatUsdt(invoice.unitPrice)}
                </td>
                <td className="px-4 py-5 text-right font-black">
                  {formatUsdt(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-7 max-w-sm rounded-xl bg-slate-950 p-5 text-white">
          <div className="flex justify-between gap-4 text-sm text-slate-300">
            <span>Subtotal</span>
            <span>{formatUsdt(total)}</span>
          </div>
          <div className="mt-4 flex justify-between gap-4 border-t border-slate-700 pt-4 text-xl font-black">
            <span>Total</span>
            <span className="text-cyan-300">{formatUsdt(total)}</span>
          </div>
          <p className="mt-2 text-right text-xs text-slate-400">
            Crypto conversion rate is not shown.
          </p>
        </div>

        {invoice.notes && (
          <div className="mt-7 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Notes
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
              {invoice.notes}
            </p>
          </div>
        )}

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs leading-6 text-slate-500">
          <p className="font-bold text-slate-700">Thank you for choosing InGamePIN.</p>
          <p>
            support@ingamepin.com · WhatsApp +91-9073045011 · Telegram
            @ingamepinsupport
          </p>
          <p>This is a computer-generated invoice.</p>
        </footer>
      </div>
    </section>
  );
}
