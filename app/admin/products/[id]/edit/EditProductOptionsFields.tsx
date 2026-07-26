"use client";

import { useEffect, useState } from "react";

import { deleteProductOption } from "../../actions";
import {
  addCodesForOption,
  changeCodeStatusForOption,
  deleteProductCode,
} from "./ProductCodeInventoryActions";
import type { EditableProductCode } from "./ProductOptionsInventorySection";
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
  initialCodes: EditableProductCode[];
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
  initialCodes,
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
  const [expandedInventory, setExpandedInventory] = useState<string | null>(null);
  const [expandedRecent, setExpandedRecent] = useState<string | null>(null);

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

            {!row.isNew && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black">Voucher / code inventory</p>
                    <p className="text-sm text-slate-500">
                      {initialCodes.filter((code) => code.productOptionId === row.id && code.status === "AVAILABLE").length} available Â·{" "}
                      {initialCodes.filter((code) => code.productOptionId === row.id && code.status === "SOLD").length} sold Â·{" "}
                      {initialCodes.filter((code) => code.productOptionId === row.id && code.status === "RESERVED").length} reserved
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedInventory((current) =>
                        current === row.id ? null : row.id,
                      )
                    }
                    className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-600 transition hover:bg-blue-50"
                  >
                    {expandedInventory === row.id ? "Hide inventory" : "Manage codes"}
                  </button>
                </div>

                {expandedInventory === row.id && (
                  <div className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-white p-4">
                    <label>
                      <span className="text-sm font-bold">Upload voucher codes</span>
                      <textarea
                        name={`codes_${row.clientId}`}
                        rows={5}
                        spellCheck={false}
                        placeholder={"One code per line\nAAAA-BBBB-CCCC"}
                        className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label>
                      <span className="text-sm font-bold">Batch note (optional)</span>
                      <input
                        name={`code_note_${row.clientId}`}
                        maxLength={200}
                        placeholder="Supplier or batch name"
                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <button
                      type="submit"
                      formAction={addCodesForOption.bind(
                        null,
                        productId,
                        row.id,
                        String(row.clientId),
                      )}
                      formNoValidate
                      className="w-fit rounded-xl bg-slate-900 px-5 py-3 font-black text-white transition hover:bg-blue-600"
                    >
                      Upload codes
                    </button>

                    <div className="border-t border-slate-200 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-black">Recent codes</p>
                          <p className="text-sm text-slate-500">
                            Hidden until you need to manage them.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRecent((current) =>
                              current === row.id ? null : row.id,
                            )
                          }
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          {expandedRecent === row.id ? "Hide codes" : "Show codes"}
                        </button>
                      </div>

                      {expandedRecent === row.id && (
                        <div className="mt-4 divide-y divide-slate-200">
                          {initialCodes
                            .filter((code) => code.productOptionId === row.id)
                            .map((code) => (
                              <div
                                key={code.id}
                                className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                              >
                                <div>
                                  <p className="font-mono text-sm text-slate-600">
                                    {code.code.length <= 8
                                      ? "********"
                                      : `${code.code.slice(0, 4)}****${code.code.slice(-4)}`}
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-slate-500">
                                    {code.status}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {(code.status === "AVAILABLE" ||
                                    code.status === "DISABLED") && (
                                    <>
                                      <button
                                        type="submit"
                                        formAction={changeCodeStatusForOption.bind(
                                          null,
                                          productId,
                                          code.id,
                                          code.status === "AVAILABLE"
                                            ? "DISABLED"
                                            : "AVAILABLE",
                                        )}
                                        formNoValidate
                                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                                      >
                                        {code.status === "AVAILABLE" ? "Disable" : "Enable"}
                                      </button>
                                      <button
                                        type="submit"
                                        formAction={deleteProductCode.bind(
                                          null,
                                          productId,
                                          code.id,
                                        )}
                                        formNoValidate
                                        onClick={(event) => {
                                          if (
                                            !window.confirm(
                                              "Delete this voucher code permanently? This cannot be undone.",
                                            )
                                          ) {
                                            event.preventDefault();
                                          }
                                        }}
                                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
                                      >
                                        Delete permanently
                                      </button>
                                    </>
                                  )}
                                  {(code.status === "SOLD" ||
                                    code.status === "RESERVED") && (
                                    <span className="text-xs text-slate-400">
                                      Protected order history
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}

                          {initialCodes.filter(
                            (code) => code.productOptionId === row.id,
                          ).length === 0 && (
                            <p className="py-5 text-center text-sm text-slate-500">
                              No codes uploaded for this option.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
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


