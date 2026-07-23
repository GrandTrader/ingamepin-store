"use client";

import { useState } from "react";

type Product = {
  id: string;
  name: string;
};

type ExportCodesProps = {
  products: Product[];
};

export default function ExportCodes({
  products,
}: ExportCodesProps) {
  const [productId, setProductId] =
    useState("");

  const soldUrl = productId
    ? `/admin/gift-codes/export?product_id=${encodeURIComponent(
        productId,
      )}&status=sold`
    : "#";

  const unsoldUrl = productId
    ? `/admin/gift-codes/export?product_id=${encodeURIComponent(
        productId,
      )}&status=unsold`
    : "#";

  function preventEmptyDownload(
    event: React.MouseEvent<HTMLAnchorElement>,
  ) {
    if (!productId) {
      event.preventDefault();
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black">
        Export gift-card codes
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Select one product and download its sold or
        available codes as a separate CSV file.
      </p>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-end">
        <label>
          <span className="text-sm font-bold">
            Product
          </span>

          <select
            value={productId}
            onChange={(event) =>
              setProductId(event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">
              Select a product
            </option>

            {products.map((product) => (
              <option
                key={product.id}
                value={product.id}
              >
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <a
          href={unsoldUrl}
          download
          onClick={preventEmptyDownload}
          aria-disabled={!productId}
          className={`rounded-xl px-5 py-3 text-center font-bold transition ${
            productId
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "cursor-not-allowed bg-slate-200 text-slate-400"
          }`}
        >
          Download Unsold CSV
        </a>

        <a
          href={soldUrl}
          download
          onClick={preventEmptyDownload}
          aria-disabled={!productId}
          className={`rounded-xl px-5 py-3 text-center font-bold transition ${
            productId
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "cursor-not-allowed bg-slate-200 text-slate-400"
          }`}
        >
          Download Sold CSV
        </a>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Unsold exports contain AVAILABLE codes only.
      </p>
    </section>
  );
}