"use client";

import { useEffect, useState } from "react";

import {
  DELIVERY_TYPE_EVENT,
  type ProductDeliveryType,
} from "../DeliveryTypeSwitch";

type OptionType =
  | "CURRENCY"
  | "IN_PLATFORM"
  | "OTHER";

type OptionRow = {
  id: number;
  type: OptionType;
  value: string;
  unit: string;
  currency: string;
  stockQuantity: number;
  inStock: boolean;
};

function getOptionName(row: OptionRow) {
  const value = row.value.trim();
  const unit = row.unit.trim();

  if (row.type === "CURRENCY") {
    return value
      ? `${row.currency} ${value}`
      : "";
  }

  if (row.type === "IN_PLATFORM") {
    return value && unit
      ? `${value} ${unit}`
      : "";
  }

  return value;
}

export default function ProductOptionsFields() {
  const [deliveryType, setDeliveryType] =
    useState<ProductDeliveryType>("MANUAL");
  const [rows, setRows] = useState<OptionRow[]>([
    {
      id: 1,
      type: "CURRENCY",
      value: "",
      unit: "",
      currency: "INR",
      stockQuantity: 0,
      inStock: false,
    },
  ]);

  const [nextId, setNextId] = useState(2);

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
        id: nextId,
        type: "CURRENCY",
        value: "",
        unit: "",
        currency: "INR",
        stockQuantity: 0,
        inStock: false,
      },
    ]);

    setNextId((current) => current + 1);
  }

  function removeRow(id: number) {
    setRows((current) =>
      current.filter((row) => row.id !== id),
    );
  }

  function updateRow(
    id: number,
    changes: Partial<OptionRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              ...changes,
            }
          : row,
      ),
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black">
            Product options
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Add denominations, in-game currency,
            editions or subscription plans.
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
        {rows.map((row, index) => {
          const optionName =
            getOptionName(row);

          return (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label>
                  <span className="text-sm font-bold">
                    Option type
                  </span>

                  <select
                    value={row.type}
                    onChange={(event) =>
                      updateRow(row.id, {
                        type: event.target
                          .value as OptionType,
                        value: "",
                        unit: "",
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="CURRENCY">
                      Currency denomination
                    </option>

                    <option value="IN_PLATFORM">
                      In-platform currency
                    </option>

                    <option value="OTHER">
                      Edition or other
                    </option>
                  </select>
                </label>

                {row.type === "CURRENCY" && (
                  <>
                    <label>
                      <span className="text-sm font-bold">
                        Denomination
                      </span>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={row.value}
                        onChange={(event) =>
                          updateRow(row.id, {
                            value:
                              event.target.value,
                          })
                        }
                        placeholder="1000"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label>
                      <span className="text-sm font-bold">
                        Denomination currency
                      </span>

                      <select
                        value={row.currency}
                        onChange={(event) =>
                          updateRow(row.id, {
                            currency:
                              event.target.value,
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="INR">
                          INR
                        </option>

                        <option value="USD">
                          USD
                        </option>

                        <option value="EUR">
                          EUR
                        </option>

                        <option value="GBP">
                          GBP
                        </option>

                        <option value="AED">
                          AED
                        </option>

                        <option value="SAR">
                          SAR
                        </option>

                        <option value="CAD">
                          CAD
                        </option>

                        <option value="AUD">
                          AUD
                        </option>

                        <option value="JPY">
                          JPY
                        </option>

                        <option value="SGD">
                          SGD
                        </option>
                      </select>
                    </label>
                  </>
                )}

                {row.type === "IN_PLATFORM" && (
                  <>
                    <label>
                      <span className="text-sm font-bold">
                        Amount
                      </span>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={row.value}
                        onChange={(event) =>
                          updateRow(row.id, {
                            value:
                              event.target.value,
                          })
                        }
                        placeholder="1000"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label>
                      <span className="text-sm font-bold">
                        Unit name
                      </span>

                      <input
                        type="text"
                        required
                        maxLength={60}
                        value={row.unit}
                        onChange={(event) =>
                          updateRow(row.id, {
                            unit:
                              event.target.value,
                          })
                        }
                        placeholder="V-Bucks"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </>
                )}

                {row.type === "OTHER" && (
                  <label className="md:col-span-2">
                    <span className="text-sm font-bold">
                      Option name
                    </span>

                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={row.value}
                      onChange={(event) =>
                        updateRow(row.id, {
                          value:
                            event.target.value,
                        })
                      }
                      placeholder="Standard Edition"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                )}

                <label>
                  <span className="text-sm font-bold">
                    Selling price
                  </span>

                  <input
                    name="option_selling_price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="950"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <div>
                  <input
                    type="hidden"
                    name="option_stock_quantity"
                    value={
                      deliveryType === "MANUAL"
                        ? row.inStock
                          ? 1
                          : 0
                        : row.stockQuantity
                    }
                  />
                  <span className="text-sm font-bold">
                    {deliveryType === "MANUAL"
                      ? "Stock status"
                      : "Initial code stock"}
                  </span>
                  {deliveryType === "MANUAL" ? (
                    <label className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row.inStock}
                        onChange={(event) =>
                          updateRow(row.id, {
                            inStock: event.target.checked,
                          })
                        }
                        className="h-5 w-5 accent-blue-600"
                      />
                      <span className="font-bold">
                        {row.inStock ? "In Stock" : "Out of Stock"}
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
                        updateRow(row.id, {
                          stockQuantity: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-500">
                  Customer will see:{" "}
                  <span className="font-bold text-slate-900">
                    {optionName ||
                      "Complete the option details"}
                  </span>
                </p>

                <button
                  type="button"
                  disabled={rows.length === 1}
                  onClick={() =>
                    removeRow(row.id)
                  }
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                >
                  Remove
                </button>
              </div>

              <input
                type="hidden"
                name="option_type"
                value={row.type}
              />

              <input
                type="hidden"
                name="option_name"
                value={optionName}
              />

              <input
                type="hidden"
                name="option_denomination"
                value={
                  row.type === "CURRENCY"
                    ? row.value
                    : ""
                }
              />

              <input
                type="hidden"
                name="option_denomination_currency"
                value={
                  row.type === "CURRENCY"
                    ? row.currency
                    : ""
                }
              />

              <input
                type="hidden"
                name="option_sort_order"
                value={index}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
