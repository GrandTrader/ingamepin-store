"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
  items?: InvoiceLineItem[];
  categoryName?: string;
  productName?: string;
  optionName?: string;
  quantity?: number;
  unitPrice?: number;
  paymentStatus: string;
  network: string;
  transactionId?: string;
  notes: string;
};

export type InvoiceLineItem = {
  categoryName: string;
  productName: string;
  optionName: string;
  quantity: number;
  unitPrice: number;
  paymentMethod?: string;
  transactionId?: string;
};

type InvoiceLineDraft = {
  id: number;
  categoryId: string;
  productId: string;
  optionId: string;
  quantity: number;
  unitPrice: string;
  paymentMethod: string;
  transactionId: string;
};

type InvoiceDraft = {
  fields: Record<string, string>;
  lineItems: InvoiceLineDraft[];
};

type CustomerDetails = {
  name: string;
  email: string;
  country: string;
  taxpayerId: string;
  address: string;
};

const INVOICE_DRAFT_KEY = "ingamepin-admin-invoice-draft-v2";

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
  const formRef = useRef<HTMLFormElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerLookupRef = useRef<AbortController | null>(null);
  const draftRestoredRef = useRef(false);
  const firstCategoryId = categories[0]?.id ?? "";
  const [lineItems, setLineItems] = useState<InvoiceLineDraft[]>([
    {
      id: 1,
      categoryId: "",
      productId: "",
      optionId: "",
      quantity: 1,
      unitPrice: "",
      paymentMethod: "USDT TRC20",
      transactionId: "",
    },
  ]);
  const lineItemsRef = useRef(lineItems);
  const [nextLineId, setNextLineId] = useState(2);
  const [preview, setPreview] = useState<InvoiceData | null>(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState("Draft ready");
  const [customerLookupStatus, setCustomerLookupStatus] = useState("");
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: "",
    email: "",
    country: "",
    taxpayerId: "",
    address: "",
  });

  function readFormFields() {
    const form = formRef.current;
    if (!form) return {};

    const fields: Record<string, string> = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") fields[key] = value;
    }
    return fields;
  }

  function saveDraft(items: InvoiceLineDraft[] = lineItemsRef.current) {
    if (typeof window === "undefined") return;

    const draft: InvoiceDraft = {
      fields: readFormFields(),
      lineItems: items,
    };
    window.localStorage.setItem(INVOICE_DRAFT_KEY, JSON.stringify(draft));
    setDraftStatus("Draft saved automatically");
  }

  function scheduleDraftSave(items?: InvoiceLineDraft[]) {
    setDraftStatus("Saving draft…");
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(items), 500);
  }

  useEffect(() => {
    lineItemsRef.current = lineItems;
  }, [lineItems]);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const rawDraft = window.localStorage.getItem(INVOICE_DRAFT_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as InvoiceDraft;
      const form = formRef.current;
      if (!form || !draft.fields) return;

      for (const [name, value] of Object.entries(draft.fields)) {
        const field = form.elements.namedItem(name);
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement
        ) {
          field.value = value;
        }
      }

      setCustomer({
        name: draft.fields.customer_name ?? "",
        email: draft.fields.customer_email ?? "",
        country: draft.fields.customer_country ?? "",
        taxpayerId: draft.fields.customer_taxpayer_id ?? "",
        address: draft.fields.customer_address ?? "",
      });

      if (Array.isArray(draft.lineItems) && draft.lineItems.length > 0) {
        const restoredLines = draft.lineItems.map((line) => {
          const categoryExists = categories.some(
            (category) => category.id === line.categoryId,
          );
          const restoredCategoryId = categoryExists
            ? line.categoryId
            : firstCategoryId;
          const productExists = products.some(
            (product) =>
              product.id === line.productId &&
              product.category_id === restoredCategoryId,
          );
          const restoredProductId = productExists ? line.productId : "";
          const optionExists = options.some(
            (option) =>
              option.id === line.optionId &&
              option.product_id === restoredProductId,
          );

          return {
            ...line,
            categoryId: restoredCategoryId,
            productId: restoredProductId,
            optionId: optionExists ? line.optionId : "",
          };
        });

        setLineItems(restoredLines);
        setNextLineId(
          Math.max(...restoredLines.map((line) => Number(line.id) || 0)) + 1,
        );
      }
      setDraftStatus("Saved draft restored");
    } catch {
      window.localStorage.removeItem(INVOICE_DRAFT_KEY);
    }
  }, [categories, firstCategoryId, options, products]);

  useEffect(() => {
    const email = customer.email.trim().toLowerCase();
    if (!email.includes("@")) {
      setCustomerLookupStatus("");
      return;
    }

    const timer = setTimeout(async () => {
      customerLookupRef.current?.abort();
      const controller = new AbortController();
      customerLookupRef.current = controller;
      setCustomerLookupStatus("Checking previous invoices…");

      try {
        const response = await fetch(
          `/api/admin/invoices?customerEmail=${encodeURIComponent(email)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as {
          customer?: CustomerDetails;
          error?: string;
        };

        if (!response.ok) throw new Error(result.error ?? "Lookup failed.");
        if (!result.customer) {
          setCustomerLookupStatus("No previous customer details found");
          return;
        }

        setCustomer((current) => ({
          name: result.customer?.name || current.name,
          email: current.email,
          country: result.customer?.country || current.country,
          taxpayerId: result.customer?.taxpayerId || current.taxpayerId,
          address: result.customer?.address || current.address,
        }));
        setCustomerLookupStatus("Customer details filled automatically");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCustomerLookupStatus("Unable to load previous customer details");
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [customer.email]);

  function updateLine(
    id: number,
    changes: Partial<InvoiceLineDraft>,
  ) {
    const updated = lineItemsRef.current.map((line) =>
      line.id === id ? { ...line, ...changes } : line,
    );
    lineItemsRef.current = updated;
    setLineItems(updated);
    scheduleDraftSave(updated);
  }

  function addLine() {
    const updated = [
      ...lineItemsRef.current,
      {
        id: nextLineId,
        categoryId: "",
        productId: "",
        optionId: "",
        quantity: 1,
        unitPrice: "",
        paymentMethod: "USDT TRC20",
        transactionId: "",
      },
    ];
    lineItemsRef.current = updated;
    setLineItems(updated);
    scheduleDraftSave(updated);
    setNextLineId((current) => current + 1);
  }

  function removeLine(id: number) {
    const updated = lineItemsRef.current.filter((line) => line.id !== id);
    lineItemsRef.current = updated;
    setLineItems(updated);
    scheduleDraftSave(updated);
  }

  function generatePreview(formData: FormData) {
    const invoiceItems = lineItems.map((line) => {
      const selectedCategory = categories.find(
        (category) => category.id === line.categoryId,
      );
      const selectedProduct = products.find(
        (product) => product.id === line.productId,
      );
      const selectedOption = options.find(
        (option) => option.id === line.optionId,
      );

      return {
        categoryName: selectedCategory?.name ?? "Uncategorized",
        productName: selectedProduct?.name ?? "Selected product",
        optionName: selectedOption
          ? formatOption(selectedOption)
          : "Standard option",
        quantity: Math.max(1, Number(line.quantity)),
        unitPrice: Math.max(0, Number(line.unitPrice)),
        paymentMethod: line.paymentMethod,
        transactionId: line.transactionId.trim(),
      };
    });

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
      items: invoiceItems,
      paymentStatus: String(formData.get("payment_status") ?? "PAID"),
      network: String(formData.get("network") ?? "").trim(),
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
        window.localStorage.removeItem(INVOICE_DRAFT_KEY);
        setDraftStatus("Invoice saved permanently");
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

  const linesAreValid = lineItems.every((line) => {
    const hasOption = options.some(
      (option) =>
        option.id === line.optionId && option.product_id === line.productId,
    );

    return (
      Boolean(
        line.categoryId &&
          line.productId &&
          line.optionId &&
          line.paymentMethod,
      ) &&
      hasOption &&
      Number.isInteger(Number(line.quantity)) &&
      Number(line.quantity) > 0 &&
      Number.isFinite(Number(line.unitPrice)) &&
      Number(line.unitPrice) > 0
    );
  });

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
          ref={formRef}
          action={generatePreview}
          onInput={() => scheduleDraftSave()}
          onChange={() => scheduleDraftSave()}
          className="mt-8 grid gap-6 xl:grid-cols-2"
        >
          <div className="xl:col-span-2 flex items-center justify-end">
            <p className="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">
              {draftStatus}
            </p>
          </div>
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
            </div>

          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Customer details</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold">Customer name</span>
                <input
                  name="customer_name"
                  required
                  value={customer.name}
                  onChange={(event) =>
                    setCustomer((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">Customer email</span>
                <input
                  name="customer_email"
                  type="email"
                  required
                  value={customer.email}
                  onChange={(event) =>
                    setCustomer((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
                {customerLookupStatus && (
                  <span className="mt-2 block text-xs font-semibold text-blue-600">
                    {customerLookupStatus}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-sm font-bold">Country</span>
                <select
                  name="customer_country"
                  required
                  value={customer.country}
                  onChange={(event) =>
                    setCustomer((current) => ({
                      ...current,
                      country: event.target.value,
                    }))
                  }
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
                  value={customer.taxpayerId}
                  onChange={(event) =>
                    setCustomer((current) => ({
                      ...current,
                      taxpayerId: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold">Billing address</span>
                <textarea
                  name="customer_address"
                  rows={3}
                  value={customer.address}
                  onChange={(event) =>
                    setCustomer((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-black">Products and prices</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add one or more store products and enter each agreed USDT price manually.
                </p>
              </div>
              <button
                type="button"
                onClick={addLine}
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
              >
                + Add product
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              {lineItems.map((line, index) => {
                const availableProducts = products.filter(
                  (product) => product.category_id === line.categoryId,
                );
                const availableOptions = options.filter(
                  (option) => option.product_id === line.productId,
                );

                return (
                  <div
                    key={line.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-black text-slate-700">
                        Product {index + 1}
                      </p>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <label className="block">
                        <span className="text-sm font-bold">Category</span>
                        <select
                          required
                          value={line.categoryId}
                          onChange={(event) =>
                            updateLine(line.id, {
                              categoryId: event.target.value,
                              productId: "",
                              optionId: "",
                            })
                          }
                          className={inputClass}
                        >
                          <option value="" disabled>
                            Select category
                          </option>
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
                          required
                          value={line.productId}
                          onChange={(event) =>
                            updateLine(line.id, {
                              productId: event.target.value,
                              optionId: "",
                            })
                          }
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
                        <span className="text-sm font-bold">
                          Denomination / option
                        </span>
                        <select
                          required
                          value={line.optionId}
                          onChange={(event) =>
                            updateLine(line.id, { optionId: event.target.value })
                          }
                          disabled={!line.productId || availableOptions.length === 0}
                          className={inputClass}
                        >
                          <option value="">
                            {!line.productId
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
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.id, {
                              quantity: Number(event.target.value),
                            })
                          }
                          className={inputClass}
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-bold">
                          Manual price (USDT)
                        </span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(line.id, { unitPrice: event.target.value })
                          }
                          placeholder="100.00"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-bold">Payment method</span>
                        <select
                          value={line.paymentMethod}
                          onChange={(event) =>
                            updateLine(line.id, {
                              paymentMethod: event.target.value,
                            })
                          }
                          className={inputClass}
                        >
                          <option value="USDT TRC20">USDT TRC20</option>
                          <option value="USDT BEP20">USDT BEP20</option>
                          <option value="USDT ERC20">USDT ERC20</option>
                          <option value="USDT SOLANA">USDT Solana</option>
                          <option value="PayPalych">PayPalych</option>
                          <option value="FreeKassa">FreeKassa</option>
                          <option value="Wallet">Wallet</option>
                          <option value="Bank transfer">Bank transfer</option>
                          <option value="Cash">Cash</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-sm font-bold">
                          Transaction ID / hash
                        </span>
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          Optional
                        </span>
                        <input
                          value={line.transactionId}
                          onChange={(event) =>
                            updateLine(line.id, {
                              transactionId: event.target.value,
                            })
                          }
                          maxLength={500}
                          placeholder="Enter the transaction used for this product"
                          className={inputClass}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
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
                products.length === 0 ||
                !linesAreValid
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
  const invoiceItems: InvoiceLineItem[] =
    invoice.items && invoice.items.length > 0
      ? invoice.items
      : [
          {
            categoryName: invoice.categoryName ?? "Uncategorized",
            productName: invoice.productName ?? "Product",
            optionName: invoice.optionName ?? "Standard option",
            quantity: invoice.quantity ?? 1,
            unitPrice: invoice.unitPrice ?? 0,
            paymentMethod: invoice.network
              ? `USDT ${invoice.network}`
              : "",
            transactionId: invoice.transactionId ?? "",
          },
        ];
  const total = invoiceItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

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
            <p className="mt-3 font-black">Product payment details</p>
            <p className="mt-1 text-sm text-slate-600">
              Payment methods and transaction references are listed with each product.
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
              {invoiceItems.map((item, index) => (
                <tr
                  key={`${item.productName}-${item.optionName}-${index}`}
                  className="border-t border-slate-200"
                >
                  <td className="px-4 py-4">
                    <p className="font-bold">{item.productName}</p>
                    <p className="mt-1 text-xs font-semibold text-blue-600">
                      {item.optionName}
                    </p>
                    {item.paymentMethod && (
                      <p className="mt-2 text-[11px] font-bold text-slate-600">
                        Payment: {item.paymentMethod}
                      </p>
                    )}
                    {item.transactionId && (
                      <p className="mt-1 break-all text-[11px] text-slate-500">
                        Transaction: {item.transactionId}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {item.categoryName}
                  </td>
                  <td className="px-4 py-4 text-center">{item.quantity}</td>
                  <td className="px-4 py-4 text-right">
                    {formatUsdt(item.unitPrice)}
                  </td>
                  <td className="px-4 py-4 text-right font-black">
                    {formatUsdt(item.quantity * item.unitPrice)}
                  </td>
                </tr>
              ))}
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
