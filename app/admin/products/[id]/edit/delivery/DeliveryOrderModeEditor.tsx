"use client";

import { useState } from "react";

type DeliveryOrderModeEditorProps = {
  deliveryType: "AUTOMATIC" | "MANUAL";
  instructions: string;
  isBulk: boolean;
  bulkInstructions: string;
  isUnlimitedStock: boolean;
};

export default function DeliveryOrderModeEditor({
  deliveryType,
  instructions,
  isBulk,
  bulkInstructions,
  isUnlimitedStock,
}: DeliveryOrderModeEditorProps) {
  const [type, setType] = useState(deliveryType);
  const [bulk, setBulk] = useState(type === "MANUAL" && isBulk);

  function changeType(next: "AUTOMATIC" | "MANUAL") {
    if (next === "AUTOMATIC" && isUnlimitedStock) return;
    setType(next);
    if (next === "AUTOMATIC") setBulk(false);
  }

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-xl font-black">Delivery mode</h2>
        <input type="hidden" name="delivery_type" value={type} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => changeType("MANUAL")} className={`rounded-xl border p-4 text-left ${type === "MANUAL" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
            <span className="font-black">Manual Delivery</span>
            <span className="mt-1 block text-sm text-slate-500">Admin completes the order.</span>
          </button>
          <button type="button" disabled={isUnlimitedStock} onClick={() => changeType("AUTOMATIC")} className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${type === "AUTOMATIC" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
            <span className="font-black">Instant Delivery</span>
            <span className="mt-1 block text-sm text-slate-500">{isUnlimitedStock ? "Unavailable while Unlimited Product stock mode is active." : "Voucher codes deliver automatically."}</span>
          </button>
        </div>
      </section>

      <section className="border-t border-slate-200 pt-6">
        <h2 className="text-xl font-black">Order mode</h2>
        {type === "AUTOMATIC" ? (
          <>
            <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Instant Delivery uses automatic order mode.</p>
            <label className="mt-4 block">
              <span className="text-sm font-bold">Instant delivery instructions</span>
              <textarea name="delivery_instructions" rows={5} defaultValue={instructions} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" />
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="is_bulk_order" value={bulk ? "true" : "false"} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setBulk(false)} className={`rounded-xl border p-4 text-left ${!bulk ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
                <span className="font-black">Digital Delivery</span>
                <span className="mt-1 block text-sm text-slate-500">Admin completes a standard digital delivery order.</span>
              </button>
              <button type="button" onClick={() => setBulk(true)} className={`rounded-xl border p-4 text-left ${bulk ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
                <span className="font-black">Bulk Delivery Order</span>
                <span className="mt-1 block text-sm text-slate-500">Admin fulfills a bulk request manually.</span>
              </button>
            </div>
            {!bulk && (
              <label className="mt-4 block">
                <span className="text-sm font-bold">Digital delivery instructions</span>
                <textarea name="delivery_instructions" rows={5} defaultValue={instructions} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" />
              </label>
            )}
            {bulk && (
              <input type="hidden" name="delivery_instructions" value={instructions} />
            )}
            {bulk && (
              <label className="mt-4 block">
                <span className="text-sm font-bold">Bulk delivery instructions</span>
                <textarea name="bulk_delivery_instructions" rows={5} defaultValue={bulkInstructions} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" />
              </label>
            )}
          </>
        )}
      </section>
    </div>
  );
}
