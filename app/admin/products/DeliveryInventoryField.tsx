"use client";

import { useEffect, useState } from "react";

import {
  DELIVERY_TYPE_EVENT,
  type ProductDeliveryType,
} from "./DeliveryTypeSwitch";

type DeliveryInventoryFieldProps = {
  initialType?: ProductDeliveryType;
  initialStock?: number;
};

export default function DeliveryInventoryField({
  initialType = "MANUAL",
  initialStock = 0,
}: DeliveryInventoryFieldProps) {
  const [deliveryType, setDeliveryType] =
    useState<ProductDeliveryType>(initialType);
  const [stockQuantity, setStockQuantity] = useState(initialStock);
  const [manualInStock, setManualInStock] = useState(initialStock > 0);

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

  const submittedStock =
    deliveryType === "MANUAL"
      ? manualInStock
        ? 1
        : 0
      : stockQuantity;

  return (
    <div>
      <input
        type="hidden"
        name="stock_quantity"
        value={submittedStock}
      />
      <span className="text-sm font-bold">
        {deliveryType === "MANUAL" ? "Stock status" : "Stock quantity"}
      </span>
      {deliveryType === "MANUAL" ? (
        <label className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            checked={manualInStock}
            onChange={(event) => setManualInStock(event.target.checked)}
            className="h-5 w-5 accent-blue-600"
          />
          <span className="font-bold">
            {manualInStock ? "In Stock" : "Out of Stock"}
          </span>
        </label>
      ) : (
        <input
          type="number"
          min="0"
          step="1"
          required
          value={stockQuantity}
          onChange={(event) =>
            setStockQuantity(Number(event.target.value))
          }
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      )}
    </div>
  );
}
