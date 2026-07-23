"use client";

import { useEffect, useState } from "react";

import { deleteProductOption } from "../../actions";
import {
  DELIVERY_TYPE_EVENT,
  type ProductDeliveryType,
} from "../../DeliveryTypeSwitch";

type OptionType =
  | "CURRENCY"
  | "IN_PLATFORM"
  | "OTHER";

export type EditableProductOption = {
  id: string;
  optionType: OptionType;
  optionName: string;
  platform: string | null;
  denomination: number | null;
  denominationCurrency: string | null;
  sellingPrice: number;
  stockQuantity: number;
  isActive: boolean;
};

type EditProductOptionsFieldsProps = {
  productId: string;
  initialOptions: EditableProductOption[];
  initialDeliveryType: ProductDeliveryType;
};

type OptionRow = EditableProductOption & {
  clientId: number;
  isNew: boolean;
};

const currencies = [
  "USD",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SAR",
  "CAD",
  "AUD",
  "JPY",
  "SGD",
];

const platforms = [
  "PC",
  "Steam",
  "Epic Games",
  "Xbox Series X|S",
  "Xbox One",
  "PlayStation 5",
  "PlayStation 4",
  "Nintendo Switch",
];

export default function EditProductOptionsFields({
  productId,
  initialOptions,
  initialDeliveryType,
}: EditProductOptionsFieldsProps) {
  const [deliveryType, setDeliveryType] =
    useState<ProductDeliveryType>(initialDeliveryType);
  const [rows, setRows] = useState<OptionRow[]>(
    initialOptions.map((option, index) => ({
      ...option,
      clientId: index + 1,
      isNew: false,
    })),
  );

  const [nextClientId, setNextClientId] = useState(
    initialOptions.length + 1,
  );

  useEffect(() => {
    function updateDeliveryType(event: Event) {
      setDeliveryType(
        (event as CustomEvent<ProductDeliveryType>).detail,
      );
    }
    window.addEventListener(DELIVERY_TYPE_EVENT, updateDeliveryType);
    return () =>
      window.removeEventListener(DELIVERY_TYPE_EVENT, updateDeliveryType);
  }, []);

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: "",
        clientId: nextClientId,
        isNew: true,
        optionType: "OTHER",
        optionName: "",
        platform: null,
        denomination: null,
        denominationCurrency: null,
        sellingPrice: 0,
        stockQuantity: 0,
        isActive: true,
      },
    ]);

    setNextClientId((current) => current + 1);
  }

  function updateRow(
    clientId: number,
    changes: Partial<OptionRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.clientId === clientId
          ? { ...row, ...changes }
          : row,
      ),
    );
  }

  function changeOptionType(
    clientId: number,
    optionType: OptionType,
  ) {
    updateRow(clientId, {
      optionType,
      denomination:
        optionType === "CURRENCY" ? 1 : null,
      denominationCurrency:
        optionType === "CURRENCY" ? "USD" : null,
    });
  }

  function removeNewRow(clientId: number) {
    setRows((current) =>
      current.filter((row) => row.clientId !== clientId),
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black">Product options</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit denominations, in-game amounts, editions, or plans.
          </p>
        </div>

        <button
          type="button"
          onClick={addRow}
          className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-600 transition hover:bg-blue-50"
        >
          + Add option
        </button>
      </div>

      <div className="mt-5 grid gap-5">
        {rows.map((row, index) => (
          <div
            key={row.clientId}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-black">
                Option {index + 1}
                {row.isNew ? " - New" : ""}
              </p>

              {!row.isNew && (
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(event) =>
                      updateRow(row.clientId, {
                        isActive: event.target.checked,
                      })
                    }
                    className="h-5 w-5 accent-blue-600"
                  />
                  Show option
                </label>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label>
                <span className="text-sm font-bold">Option type</span>
                <select
                  value={row.optionType}
                  onChange={(event) =>
                    changeOptionType(
                      row.clientId,
                      event.target.value as OptionType,
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="CURRENCY">Currency denomination</option>
                  <option value="IN_PLATFORM">In-platform amount</option>
                  <option value="OTHER">Edition, plan, or other</option>
                </select>
              </label>

              <label>
                <span className="text-sm font-bold">Platform</span>
                <select
                  value={row.platform ?? ""}
                  onChange={(event) =>
                    updateRow(row.clientId, {
                      platform: event.target.value || null,
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Not applicable</option>
                  {platforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>

              <label className={row.optionType === "CURRENCY" ? "" : "md:col-span-1"}>
                <span className="text-sm font-bold">Customer option name</span>
                <input
                  value={row.optionName}
                  onChange={(event) =>
                    updateRow(row.clientId, {
                      optionName: event.target.value,
                    })
                  }
                  required
                  maxLength={100}
                  placeholder="Standard Edition or 1000 UC"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {row.optionType === "CURRENCY" && (
                <>
                  <label>
                    <span className="text-sm font-bold">Denomination</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={row.denomination ?? ""}
                      onChange={(event) =>
                        updateRow(row.clientId, {
                          denomination: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-bold">Currency</span>
                    <select
                      value={row.denominationCurrency ?? "USD"}
                      onChange={(event) =>
                        updateRow(row.clientId, {
                          denominationCurrency: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {currencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <label>
                <span className="text-sm font-bold">Selling price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={row.sellingPrice}
                  onChange={(event) =>
                    updateRow(row.clientId, {
                      sellingPrice: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div>
                <span className="text-sm font-bold">
                  {deliveryType === "MANUAL"
                    ? "Stock status"
                    : "Code stock"}
                </span>
                {deliveryType === "MANUAL" ? (
                  <label className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row.stockQuantity > 0}
                      onChange={(event) =>
                        updateRow(row.clientId, {
                          stockQuantity: event.target.checked ? 1 : 0,
                        })
                      }
                      className="h-5 w-5 accent-blue-600"
                    />
                    <span className="font-bold">
                      {row.stockQuantity > 0
                        ? "In Stock"
                        : "Out of Stock"}
                    </span>
                  </label>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={row.stockQuantity}
                    onChange={(event) =>
                      updateRow(row.clientId, {
                        stockQuantity: Number(event.target.value),
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm text-slate-500">
                Customer sees:{" "}
                <span className="font-bold text-slate-900">
                  {row.optionName || "Complete the option name"}
                </span>
              </p>

              {row.isNew && (
                <button
                  type="button"
                  onClick={() => removeNewRow(row.clientId)}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
                >
                  Remove new option
                </button>
              )}

              {!row.isNew && (
                <button
                  type="submit"
                  formAction={deleteProductOption.bind(
                    null,
                    productId,
                    row.id,
                  )}
                  formNoValidate
                  onClick={(event) => {
                    const confirmed = window.confirm(
                      `Delete "${row.optionName}" permanently? Old order history will be preserved.`,
                    );

                    if (!confirmed) {
                      event.preventDefault();
                    }
                  }}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
                >
                  Remove option permanently
                </button>
              )}
            </div>

            <input type="hidden" name="option_id" value={row.id} />
            <input type="hidden" name="option_type" value={row.optionType} />
            <input type="hidden" name="option_name" value={row.optionName} />
            <input
              type="hidden"
              name="option_platform"
              value={row.platform ?? ""}
            />
            <input
              type="hidden"
              name="option_denomination"
              value={row.optionType === "CURRENCY" ? row.denomination ?? "" : ""}
            />
            <input
              type="hidden"
              name="option_denomination_currency"
              value={
                row.optionType === "CURRENCY"
                  ? row.denominationCurrency ?? "USD"
                  : ""
              }
            />
            <input
              type="hidden"
              name="option_selling_price"
              value={row.sellingPrice}
            />
            <input
              type="hidden"
              name="option_stock_quantity"
              value={row.stockQuantity}
            />
            <input
              type="hidden"
              name="option_sort_order"
              value={index}
            />
            <input
              type="hidden"
              name="option_is_active"
              value={row.isActive ? "true" : "false"}
            />
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No fixed options exist. Select Add option to create one.
          </div>
        )}
      </div>
    </section>
  );
}
