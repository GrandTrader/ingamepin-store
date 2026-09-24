"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fullProductTemplate, MAX_PRODUCT_IMPORT_BYTES, parseFullProductCsv, resolveImportCategory,
  type FullProductImport, type ImportCategory,
} from "@/lib/full-product-import";
import { UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";
import { importFullProduct } from "./actions";

export default function FullProductImportForm({ categories }: { categories: ImportCategory[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [csv, setCsv] = useState("");
  const [product, setProduct] = useState<FullProductImport | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();
  const sequence = useRef(0);
  const submitting = useRef(false);
  let category: ImportCategory | undefined;
  let categoryError = "";
  if (product) {
    try { category = resolveImportCategory(product, categories, categoryId); }
    catch (reason) { categoryError = reason instanceof Error ? reason.message : "Choose a category."; }
  }
  const busy = reading || pending;

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([fullProductTemplate()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "Full-Product-Import-Template.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readFile(file?: File) {
    const current = ++sequence.current;
    setError(""); setProduct(null); setCsv(""); setReading(false);
    if (!file) return;
    if (file.size > MAX_PRODUCT_IMPORT_BYTES) { setError("Choose a CSV file no larger than 512 KB."); return; }
    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { throw new Error("Save your spreadsheet as CSV UTF-8 to preserve Russian text and emoji."); }
      const parsed = parseFullProductCsv(text);
      if (current !== sequence.current) return;
      setCsv(text); setProduct(parsed);
    } catch (reason) {
      if (current === sequence.current) setError(reason instanceof Error ? reason.message : "Unable to read this file.");
    } finally { if (current === sequence.current) setReading(false); }
  }

  function saveDraft() {
    if (!product || !category || busy || submitting.current) return;
    submitting.current = true; setError("");
    startTransition(async () => {
      try {
        const result = await importFullProduct(csv, categoryId);
        if (result.error) setError(result.error);
        else if (result.productId) {
          router.push("/admin/products/" + result.productId + "/edit/general");
          router.refresh();
          return;
        } else setError("The import result could not be confirmed. Check the product list before retrying.");
      } catch {
        setError("The import result could not be confirmed. Check the product list before retrying.");
      }
      submitting.current = false;
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <p>One file creates one new draft product, with up to 50 denominations. English and Russian text can be included together.</p>
        <label className="block font-semibold" htmlFor="import-category">Product category</label>
        <select id="import-category" className="w-full max-w-lg rounded-lg border p-3" value={categoryId}
          disabled={busy || Boolean(product?.categorySlug)} onChange={event => setCategoryId(event.target.value)}>
          <option value="">Choose a category</option>
          {categories.map(item => <option key={item.id} value={item.id}>{item.name} ({item.slug})</option>)}
        </select>
        {product?.categorySlug && <p className="text-sm text-slate-600">Category from CSV: {product.categorySlug}</p>}
        <div><button type="button" onClick={downloadTemplate} disabled={busy} className="rounded-lg border px-4 py-2 font-bold text-blue-700 disabled:opacity-50">Download CSV template</button></div>
        <label htmlFor="product-csv" className="block font-semibold">Choose your completed CSV</label>
        <input id="product-csv" type="file" accept=".csv,text/csv" disabled={busy}
          onChange={event => void readFile(event.target.files?.[0])} className="block max-w-full cursor-pointer rounded-lg text-sm text-slate-600 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-5 file:py-3 file:font-bold file:text-white hover:file:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:file:cursor-not-allowed" />
        <p className="text-sm text-slate-600">Save as CSV UTF-8. Maximum 512 KB. Selecting a file opens a preview; it does not save the product.</p>
        <details className="rounded-lg bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-bold">How to fill the template</summary>
          <div className="mt-3 space-y-2">
            <p>Put the product titles and descriptions in the first denomination row. Leave those cells blank on later rows, or repeat the same text. Russian text is optional.</p>
            <p>Use one row per denomination, with name, denomination and price. Every selling price must be in USD, without a $ sign, using a decimal point.</p>
            <p>Select the category above. After saving the draft, set the region, delivery, stock and other product settings manually.</p>
            <p>Denomination currency defaults to USD. For cards in another currency, change it in Product options before publishing.</p>
          </div>
        </details>
      </section>
      {reading && <p role="status">Reading your file…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>}
      {product && (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <h2 className="text-xl font-black">Preview product</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div><h3 className="font-bold">English</h3><p className="mt-2 break-words font-semibold">{product.titleEn}</p>
              <p className="mt-2 whitespace-pre-wrap break-words">{product.descriptionEn || "No description"}</p></div>
            <div lang="ru"><h3 className="font-bold" lang="en">Russian</h3><p className="mt-2 break-words font-semibold">{product.titleRu || "Not provided"}</p>
              <p className="mt-2 whitespace-pre-wrap break-words">{product.descriptionRu || "Not provided"}</p></div>
          </div>
          <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><dt className="font-bold">Category</dt><dd>{category?.name || "Not selected"}</dd></div>
            <div><dt className="font-bold">Region</dt><dd>{product.region}</dd></div>
            <div><dt className="font-bold">Delivery</dt><dd>{product.deliveryType === "MANUAL" ? "Manual" : "Automatic"}{product.isBulkOrder ? " · Bulk order" : ""}</dd></div>
            <div><dt className="font-bold">Product slug</dt><dd className="break-all">{product.slug}</dd></div>
          </dl>
          {product.isBulkOrder && <div><h3 className="font-bold">Bulk delivery instructions</h3><p className="whitespace-pre-wrap">{product.bulkDeliveryInstructions}</p></div>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left font-bold">{product.options.length} denominations · Selling prices in USD</caption>
              <thead className="bg-slate-100"><tr>{["Name", "Card value", "Price (USD)", "Stock quantity", "In stock"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
              <tbody>{product.options.map(option => <tr key={option.name} className="border-b">
                <td className="p-3">{option.name}</td><td className="p-3">{option.denomination} {option.currency}</td>
                <td className="p-3">${option.price.toFixed(2)}</td>
                <td className="p-3">{option.stockQuantity === UNLIMITED_STOCK_QUANTITY ? "Unlimited" : option.stockQuantity}</td>
                <td className="p-3">{option.isInStock ? "Yes" : "No"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {categoryError && <p role="alert" className="text-red-700">{categoryError}</p>}
          <p className="text-sm text-slate-600">The product will be saved as a draft. You can add an image and review it before publishing.</p>
          <button type="button" onClick={saveDraft} disabled={busy || !category}
            className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? "Saving draft…" : "Confirm and save draft"}
          </button>
        </section>
      )}
    </div>
  );
}

