"use client";

import { useState } from "react";

type OrderModeSwitchProps = {
  initialBulkOrder?: boolean;
  initialBulkDeliveryInstructions?: string | null;
};

export default function OrderModeSwitch({
  initialBulkOrder = false,
  initialBulkDeliveryInstructions = "",
}: OrderModeSwitchProps) {
  const [isBulkOrder, setIsBulkOrder] =
    useState(initialBulkOrder);

  return (
    <div>
      <input
        type="hidden"
        name="is_bulk_order"
        value={isBulkOrder ? "true" : "false"}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setIsBulkOrder(false)}
          className={`rounded-2xl border p-4 text-left transition ${
            !isBulkOrder
              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-black">
              Normal Order
            </span>
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${
                !isBulkOrder
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 text-transparent"
              }`}
            >
              ✓
            </span>
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Current standard product experience.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsBulkOrder(true)}
          className={`rounded-2xl border p-4 text-left transition ${
            isBulkOrder
              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-black">
              Bulk Order
            </span>
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${
                isBulkOrder
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 text-transparent"
              }`}
            >
              ✓
            </span>
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Shows a clear Bulk Order label on the product image.
          </span>
        </button>
      </div>

      {isBulkOrder && (
        <label className="mt-5 block border-t border-slate-200 pt-5">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">
              Bulk delivery instructions
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              Bulk mode only
            </span>
          </span>
          <textarea
            name="bulk_delivery_instructions"
            rows={4}
            maxLength={2000}
            required
            defaultValue={
              initialBulkDeliveryInstructions ?? ""
            }
            placeholder="Example: Minimum 10 units. Delivery within 2–6 hours after payment verification."
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <span className="mt-2 block text-xs text-slate-500">
            Customers will see this message clearly on the product page.
          </span>
        </label>
      )}
    </div>
  );
}
