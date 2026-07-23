"use client";

import { useState } from "react";

type ProductType =
  | "GAME_TOPUP"
  | "GAME_KEY"
  | "GIFT_CARD"
  | "SUBSCRIPTION"
  | "DIGITAL_PRODUCT";

export default function ProductTypeFields() {
  const [productType, setProductType] =
    useState<ProductType>("GIFT_CARD");

  const [
    allowsFixedValues,
    setAllowsFixedValues,
  ] = useState(true);

  const [
    allowsCustomValue,
    setAllowsCustomValue,
  ] = useState(false);

  const isGiftCard =
    productType === "GIFT_CARD";

  return (
    <>
      <label>
        <span className="text-sm font-bold">
          Product type
        </span>

        <select
          name="product_type"
          required
          value={productType}
          onChange={(event) =>
            setProductType(
              event.target
                .value as ProductType,
            )
          }
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="GAME_TOPUP">
            Game Top-Up
          </option>

          <option value="GAME_KEY">
            Game Key
          </option>

          <option value="GIFT_CARD">
            Gift Card
          </option>

          <option value="SUBSCRIPTION">
            Subscription
          </option>

          <option value="DIGITAL_PRODUCT">
            Other Digital Product
          </option>
        </select>
      </label>

      {isGiftCard && (
        <div className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 md:col-span-2 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="font-black text-slate-900">
              Gift Card values
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Enable fixed denominations,
              customer-entered values, or both.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white p-4">
            <input
              name="allows_fixed_values"
              type="checkbox"
              checked={allowsFixedValues}
              onChange={(event) =>
                setAllowsFixedValues(
                  event.target.checked,
                )
              }
              className="mt-0.5 h-5 w-5 accent-blue-600"
            />

            <span>
              <span className="block text-sm font-bold">
                Fixed values
              </span>

              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Create predefined values such
                as ₹100, ₹250 and ₹500 in the
                product-options section.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white p-4">
            <input
              name="allows_custom_value"
              type="checkbox"
              checked={allowsCustomValue}
              onChange={(event) =>
                setAllowsCustomValue(
                  event.target.checked,
                )
              }
              className="mt-0.5 h-5 w-5 accent-blue-600"
            />

            <span>
              <span className="block text-sm font-bold">
                Custom value
              </span>

              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Allow customers to enter their
                own gift-card amount.
              </span>
            </span>
          </label>

          {allowsCustomValue && (
            <>
              <label>
                <span className="text-sm font-bold">
                  Minimum custom value
                </span>

                <input
                  name="minimum_custom_value"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="10"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="text-sm font-bold">
                  Maximum custom value
                </span>

                <input
                  name="maximum_custom_value"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="10000"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </>
          )}

          {!allowsFixedValues &&
            !allowsCustomValue && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
                Enable at least one Gift Card
                value method.
              </p>
            )}
        </div>
      )}
    </>
  );
}