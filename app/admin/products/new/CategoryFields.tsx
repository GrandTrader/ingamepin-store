"use client";

import { useState } from "react";

type CategoryType =
  | "GAME_TOPUP"
  | "GIFT_CARD"
  | "SUBSCRIPTION"
  | "GAME_KEY";

type Category = {
  id: string;
  name: string;
  categoryType: CategoryType;
};

type CategoryFieldsProps = {
  categories: Category[];
};

export default function CategoryFields({
  categories,
}: CategoryFieldsProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [allowsFixedValues, setAllowsFixedValues] = useState(true);
  const [allowsCustomValue, setAllowsCustomValue] = useState(false);
  const [allowsPlayerIdTopup, setAllowsPlayerIdTopup] = useState(false);
  const [allowsGamingVoucher, setAllowsGamingVoucher] = useState(true);

  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );

  const categoryType = selectedCategory?.categoryType ?? "";
  const isGiftCard = categoryType === "GIFT_CARD";
  const isGamingTopup = categoryType === "GAME_TOPUP";

  function changeCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setAllowsFixedValues(true);
    setAllowsCustomValue(false);
    setAllowsPlayerIdTopup(false);
    setAllowsGamingVoucher(true);
  }

  return (
    <>
      <label>
        <span className="text-sm font-bold">Product category</span>

        <select
          name="category_id"
          required
          value={selectedCategoryId}
          onChange={(event) => changeCategory(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="" disabled>
            Select a category
          </option>

          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <input type="hidden" name="product_type" value={categoryType} />

      {selectedCategory && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-700">
            Category configuration
          </p>

          <p className="mt-1 text-xs text-slate-600">
            Product settings will be configured automatically for{" "}
            {selectedCategory.name}.
          </p>
        </div>
      )}

      {isGamingTopup && (
        <div className="grid gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-5 md:col-span-2 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="font-black text-slate-900">
              Gaming Top-Up method
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Enable Player ID top-up, gaming voucher delivery, or both.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-violet-100 bg-white p-4">
            <input
              name="allows_player_id_topup"
              type="checkbox"
              checked={allowsPlayerIdTopup}
              onChange={(event) =>
                setAllowsPlayerIdTopup(event.target.checked)
              }
              className="mt-0.5 h-5 w-5 accent-violet-600"
            />

            <span>
              <span className="block text-sm font-bold">
                Player ID top-up
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Customer enters a Player ID for manual or API top-up.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-violet-100 bg-white p-4">
            <input
              name="allows_gaming_voucher"
              type="checkbox"
              checked={allowsGamingVoucher}
              onChange={(event) =>
                setAllowsGamingVoucher(event.target.checked)
              }
              className="mt-0.5 h-5 w-5 accent-violet-600"
            />

            <span>
              <span className="block text-sm font-bold">
                Gaming voucher
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Deliver a voucher code manually after payment verification.
              </span>
            </span>
          </label>

          {allowsPlayerIdTopup && (
            <label className="md:col-span-2">
              <span className="text-sm font-bold">
                Player ID field label
              </span>
              <input
                name="player_id_label"
                required
                maxLength={100}
                defaultValue="Player ID"
                placeholder="Example: PUBG Player ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
            </label>
          )}

          {!allowsPlayerIdTopup && !allowsGamingVoucher && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
              Enable Player ID top-up, Gaming voucher, or both.
            </p>
          )}
        </div>
      )}

      {isGiftCard && (
        <div className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 md:col-span-2 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="font-black text-slate-900">Gift Card values</h3>
            <p className="mt-1 text-sm text-slate-500">
              Enable fixed values, a customer-entered value, or both.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white p-4">
            <input
              name="allows_fixed_values"
              type="checkbox"
              checked={allowsFixedValues}
              onChange={(event) =>
                setAllowsFixedValues(event.target.checked)
              }
              className="mt-0.5 h-5 w-5 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-bold">Fixed values</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Add saved denominations such as ₹100, ₹250 and ₹500.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-white p-4">
            <input
              name="allows_custom_value"
              type="checkbox"
              checked={allowsCustomValue}
              onChange={(event) =>
                setAllowsCustomValue(event.target.checked)
              }
              className="mt-0.5 h-5 w-5 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-bold">Custom value</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Allow the customer to enter an amount within your limits.
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
                  placeholder="100"
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

          {!allowsFixedValues && !allowsCustomValue && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
              Enable fixed values, custom value, or both.
            </p>
          )}
        </div>
      )}
    </>
  );
}
