"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DELIVERY_TYPE_EVENT,
  type ProductDeliveryType,
} from "../DeliveryTypeSwitch";

type OptionType = "CURRENCY" | "OTHER";
type ManualStockMode = "UNLIMITED" | "QUANTITY";

type OptionRow = {
  id: number;
  type: OptionType;
  value: string;
  currency: string;
  sellingPrice: string;
  stockMode: ManualStockMode;
  stockQuantity: string;
};

const denominations = [
  100, 200, 300, 400, 500, 750, 1000,
  1500, 2000, 2500, 3000, 4000, 5000,
  7500, 10000,
];

const currencies = [
  "USD", "INR", "RUB", "TRY", "EUR", "GBP",
  "AED", "SAR", "CAD", "AUD", "JPY", "SGD",
];

function newRow(id: number): OptionRow {
  return {
    id,
    type: "CURRENCY",
    value: "100",
    currency: "USD",
    sellingPrice: "",
    stockMode: "UNLIMITED",
    stockQuantity: "0",
  };
}

function optionName(row: OptionRow) {
  if (row.type === "CURRENCY") {
    return `${row.currency} ${row.value}`;
  }

  return row.value.trim();
}

export default function ProductOptionsFields() {
  const [deliveryType, setDeliveryType] =
    useState<ProductDeliveryType>("MANUAL");
  const [rows, setRows] = useState<OptionRow[]>([
    newRow(1),
  ]);
  const [nextId, setNextId] = useState(2);

  useEffect(() => {
    function clearRestoredOptions(event: PageTransitionEvent) {
      if (!event.persisted) return;
      setRows([newRow(1)]);
      setNextId(2);
    }

    window.addEventListener("pageshow", clearRestoredOptions);
    return () => window.removeEventListener("pageshow", clearRestoredOptions);
  }, []);

  useEffect(() => {
    function updateDeliveryType(event: Event) {
      setDeliveryType(
        (event as CustomEvent<ProductDeliveryType>)
          .detail,
      );
    }

    window.addEventListener(
      DELIVERY_TYPE_EVENT,
      updateDeliveryType,
    );

    return () =>
      window.removeEventListener(
        DELIVERY_TYPE_EVENT,
        updateDeliveryType,
      );
  }, []);

  const startingPrice = useMemo(() => {
    const values = rows
      .map((row) => Number(row.sellingPrice))
      .filter(
        (value) =>
          Number.isFinite(value) && value >= 0,
      );

    return values.length > 0
      ? Math.min(...values).toFixed(2)
      : "Not set";
  }, [rows]);

  const productCurrency = useMemo(() => {
    const values = Array.from(
      new Set(
        rows
          .filter(
            (row) => row.type === "CURRENCY",
          )
          .map((row) => row.currency),
      ),
    );

    if (values.length === 0) {
      return "USD";
    }

    return values.length === 1
      ? values[0]
      : "Multiple";
  }, [rows]);

  const stockSummary = useMemo(() => {
    if (deliveryType === "AUTOMATIC") {
      return "From available codes";
    }

    if (
      rows.every(
        (row) =>
          row.stockMode === "UNLIMITED",
      )
    ) {
      return "Unlimited";
    }

    return String(
      rows.reduce(
        (total, row) =>
          row.stockMode === "QUANTITY"
            ? total +
              Number(row.stockQuantity || 0)
            : total,
        0,
      ),
    );
  }, [deliveryType, rows]);

  function updateRow(
    id: number,
    changes: Partial<OptionRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, ...changes }
          : row,
      ),
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      newRow(nextId),
    ]);
    setNextId((current) => current + 1);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black">
            Product options
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Base price, currency and stock are
            calculated automatically.
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
          const name = optionName(row);

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
                        type:
                          event.target
                            .value as OptionType,
                        value:
                          event.target.value ===
                          "CURRENCY"
                            ? "100"
                            : "",
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="CURRENCY">
                      Currency denomination
                    </option>
                    <option value="OTHER">
                      Edition or other
                    </option>
                  </select>
                </label>

                {row.type === "CURRENCY" ? (
                  <>
                    <label>
                      <span className="text-sm font-bold">
                        Denomination
                      </span>
                      <select
                        value={row.value}
                        onChange={(event) =>
                          updateRow(row.id, {
                            value: event.target.value,
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        {denominations.map(
                          (denomination) => (
                            <option
                              key={denomination}
                              value={denomination}
                            >
                              {denomination}
                            </option>
                          ),
                        )}
                      </select>
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
                        {currencies.map(
                          (currency) => (
                            <option
                              key={currency}
                              value={currency}
                            >
                              {currency}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </>
                ) : (
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
                          value: event.target.value,
                        })
                      }
                      placeholder="Standard Edition"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                )}

                <label>
                  <span className="text-sm font-bold">
                    Selling price (USD)
                  </span>
                  <input
                    name="option_selling_price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={row.sellingPrice}
                    onChange={(event) =>
                      updateRow(row.id, {
                        sellingPrice:
                          event.target.value,
                      })
                    }
                    placeholder="11.50"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                {deliveryType === "MANUAL" && (
                  <>
                    <label>
                      <span className="text-sm font-bold">
                        Stock
                      </span>
                      <select
                        name="option_stock_mode"
                        value={row.stockMode}
                        onChange={(event) =>
                          updateRow(row.id, {
                            stockMode:
                              event.target
                                .value as ManualStockMode,
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="UNLIMITED">
                          Unlimited
                        </option>
                        <option value="QUANTITY">
                          Mentioned quantity
                        </option>
                      </select>
                    </label>

                    {row.stockMode ===
                      "QUANTITY" && (
                      <label>
                        <span className="text-sm font-bold">
                          Available quantity
                        </span>
                        <input
                          name="option_stock_quantity"
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={row.stockQuantity}
                          onChange={(event) =>
                            updateRow(row.id, {
                              stockQuantity:
                                event.target.value,
                            })
                          }
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    )}

                    {row.stockMode ===
                      "UNLIMITED" && (
                      <input
                        type="hidden"
                        name="option_stock_quantity"
                        value="0"
                      />
                    )}
                  </>
                )}

                {deliveryType === "AUTOMATIC" && (
                  <>
                    <input
                      type="hidden"
                      name="option_stock_mode"
                      value="CODES"
                    />
                    <input
                      type="hidden"
                      name="option_stock_quantity"
                      value="0"
                    />
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      Stock will come from available
                      codes.
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-500">
                  Customer will see:{" "}
                  <span className="font-bold text-slate-900">
                    {name ||
                      "Complete the option details"}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((current) =>
                      current.filter(
                        (item) =>
                          item.id !== row.id,
                      ),
                    )
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
                value={name}
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

      <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">
            Starting price
          </p>
          <p className="mt-1 font-black">
            {startingPrice === "Not set"
              ? startingPrice
              : `$${startingPrice}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">
            Product currency
          </p>
          <p className="mt-1 font-black">
            {productCurrency}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">
            Stock
          </p>
          <p className="mt-1 font-black">
            {stockSummary}
          </p>
        </div>
      </div>
    </section>
  );
}
