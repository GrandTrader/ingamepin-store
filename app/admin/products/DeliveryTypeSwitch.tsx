"use client";

import Link from "next/link";
import { useState } from "react";

export type ProductDeliveryType = "MANUAL" | "AUTOMATIC";

type DeliveryTypeSwitchProps = {
  initialType?: ProductDeliveryType;
  productId?: string;
};

export const DELIVERY_TYPE_EVENT = "ingamepin-delivery-type-change";

export default function DeliveryTypeSwitch({
  initialType = "MANUAL",
  productId,
}: DeliveryTypeSwitchProps) {
  const [deliveryType, setDeliveryType] =
    useState<ProductDeliveryType>(initialType);
  const isInstant = deliveryType === "AUTOMATIC";

  function changeMode(instant: boolean) {
    const nextType = instant ? "AUTOMATIC" : "MANUAL";
    setDeliveryType(nextType);
    window.dispatchEvent(
      new CustomEvent(DELIVERY_TYPE_EVENT, { detail: nextType }),
    );
  }

  return (
    <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="delivery_type" value={deliveryType} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="block text-sm font-bold">Delivery mode</span>
          <span className="mt-1 block text-xs text-slate-500">
            Manual orders are completed by admin. Instant orders use available
            product codes automatically.
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-3 font-bold">
          <span className={!isInstant ? "text-blue-600" : "text-slate-500"}>
            Manual
          </span>
          <input
            type="checkbox"
            checked={isInstant}
            onChange={(event) => changeMode(event.target.checked)}
            className="peer sr-only"
          />
          <span className="relative h-7 w-12 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          <span className={isInstant ? "text-blue-600" : "text-slate-500"}>
            Instant
          </span>
        </label>
      </div>

      {isInstant && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Codes are managed separately for every variant.
          {productId ? (
            <Link
              href={`/admin/gift-codes?productId=${productId}`}
              className="ml-2 font-black underline"
            >
              Add or modify product codes
            </Link>
          ) : (
            <span className="ml-1 font-bold">
              Save the product first, then add its codes.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
