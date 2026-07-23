"use client";

import { useState } from "react";

import { addGiftCodes } from "./actions";

type ProductOption = {
  id: string;
  name: string;
  denomination: number | null;
};

type ProductWithOptions = {
  id: string;
  name: string;
  options: ProductOption[];
};

type AddGiftCodesFormProps = {
  products: ProductWithOptions[];
};

export default function AddGiftCodesForm({
  products,
}: AddGiftCodesFormProps) {
  const [productId, setProductId] =
    useState("");

  const [optionId, setOptionId] =
    useState("");

  const selectedProduct = products.find(
    (product) => product.id === productId,
  );

  const productOptions =
    selectedProduct?.options ?? [];

  const selectedOption =
    productOptions.find(
      (option) => option.id === optionId,
    );

  function handleProductChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    setProductId(event.target.value);
    setOptionId("");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black">
        Add digital codes
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Select a product and product option, then
        enter one code per line.
      </p>

      <form
        action={addGiftCodes}
        className="mt-6 grid gap-5"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <span className="text-sm font-bold">
              Product
            </span>

            <select
              name="product_id"
              required
              value={productId}
              onChange={handleProductChange}
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

          <label>
            <span className="text-sm font-bold">
              Product option
            </span>

            <select
              name="product_option_id"
              required
              value={optionId}
              disabled={!productId}
              onChange={(event) =>
                setOptionId(
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">
                {productId
                  ? "Select a product option"
                  : "Select a product first"}
              </option>

              {productOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </option>
              ))}
            </select>

            {productId &&
              productOptions.length === 0 && (
                <p className="mt-2 text-xs text-red-600">
                  This product has no active
                  options.
                </p>
              )}
          </label>
        </div>

        <input
          type="hidden"
          name="denomination"
          value={
            selectedOption?.denomination ??
            ""
          }
        />

        <label>
          <span className="text-sm font-bold">
            Digital codes
          </span>

          <textarea
            name="codes"
            required
            rows={8}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              "AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF"
            }
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <label>
          <span className="text-sm font-bold">
            Internal note
          </span>

          <input
            name="note"
            placeholder="Optional supplier or batch note"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <button
          type="submit"
          disabled={
            !productId || !optionId
          }
          className="w-fit rounded-xl bg-slate-900 px-6 py-3 font-black text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Add Codes
        </button>
      </form>
    </section>
  );
}