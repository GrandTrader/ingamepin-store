"use client";

import { useMemo, useState } from "react";

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

type EditCategoryFieldsProps = {
  categories: Category[];
  currentCategoryId: string;
  currentAllowsFixedValues: boolean;
  currentAllowsCustomValue: boolean;
  currentMinimumCustomValue: number | null;
  currentMaximumCustomValue: number | null;
  currentAllowsPlayerIdTopup: boolean;
  currentAllowsGamingVoucher: boolean;
  currentPlayerIdLabel: string | null;
};

export default function EditCategoryFields({
  categories,
  currentCategoryId,
  currentAllowsFixedValues,
  currentAllowsCustomValue,
  currentMinimumCustomValue,
  currentMaximumCustomValue,
  currentAllowsPlayerIdTopup,
  currentAllowsGamingVoucher,
  currentPlayerIdLabel,
}: EditCategoryFieldsProps) {
  const [selectedCategoryId, setSelectedCategoryId] =
    useState(currentCategoryId);

  const [allowsFixedValues, setAllowsFixedValues] =
    useState(currentAllowsFixedValues);

  const [allowsCustomValue, setAllowsCustomValue] =
    useState(currentAllowsCustomValue);

  const [allowsPlayerIdTopup, setAllowsPlayerIdTopup] =
    useState(currentAllowsPlayerIdTopup);

  const [allowsGamingVoucher, setAllowsGamingVoucher] =
    useState(currentAllowsGamingVoucher);

  const selectedCategory = useMemo(
    () =>
      categories.find(
        (category) => category.id === selectedCategoryId,
      ),
    [categories, selectedCategoryId],
  );

  const categoryType = selectedCategory?.categoryType ?? "";
  const isGiftCard = categoryType === "GIFT_CARD";
  const isGamingTopup = categoryType === "GAME_TOPUP";

  function changeCategory(categoryId: string) {
    const category = categories.find(
      (item) => item.id === categoryId,
    );

    setSelectedCategoryId(categoryId);

    if (category?.categoryType === "GIFT_CARD") {
      setAllowsFixedValues(true);
      setAllowsCustomValue(false);
    }

    if (category?.categoryType === "GAME_TOPUP") {
      setAllowsPlayerIdTopup(false);
      setAllowsGamingVoucher(true);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
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

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-bold text-blue-700">
          Category behavior
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {selectedCategory
            ? `${selectedCategory.name} settings are applied automatically.`
            : "Select a category."}
        </p>
      </div>

      {isGamingTopup && (
        <div className="grid gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-5 md:col-span-2 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="font-black">Gaming Top-Up method</h3>
            <p className="mt-1 text-sm text-slate-500">
              Enable Player ID top-up, gaming voucher, or both.
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
                Customer provides a Player ID for manual or API delivery.
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
                Deliver a saved voucher code after payment approval.
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
                minLength={2}
                maxLength={100}
                defaultValue={currentPlayerIdLabel ?? "Player ID"}
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
            <h3 className="font-black">Gift Card values</h3>
            <p className="mt-1 text-sm text-slate-500">
              Enable fixed values, custom value, or both.
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
                Customers select a saved denomination from the list.
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
                Customers enter an amount within your limits.
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
                  defaultValue={currentMinimumCustomValue ?? ""}
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
                  defaultValue={currentMaximumCustomValue ?? ""}
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
    </div>
  );
}
