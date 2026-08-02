"use client";

import { useState } from "react";
import { removeDenominationQuantity, saveDenominationQuantity } from "@/app/admin/products/[id]/edit/restrictions/actions";

type QuantityOption = {
  id: string;
  name: string;
  denomination: number | null;
  currency: string | null;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
  sellingPrice: number;
};

export default function DenominationQuantityEditor({ productId, options, defaultMinimum, defaultMaximum }: { productId: string; options: QuantityOption[]; defaultMinimum: number; defaultMaximum: number }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = options.find((option) => option.id === selectedId);

  return <form action={saveDenominationQuantity} className="mt-8 rounded-2xl border border-slate-200 p-6 shadow-sm">
    <input type="hidden" name="id" value={productId} />
    <h2 className="text-xl font-black">Denomination quantity restriction</h2>
    <p className="mt-1 text-sm text-slate-500">Select a denomination to set its own allowed quantity.</p>
    <label className="mt-5 block max-w-xl font-bold">Select denomination
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3">
        <option value="">Choose denomination</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name} | ${option.sellingPrice.toFixed(2)} USD</option>)}
      </select>
    </label>
    {selected && <div key={selected.id} className="mt-5 grid gap-5 rounded-xl border border-blue-200 bg-blue-50 p-5 sm:grid-cols-2">
      <input type="hidden" name="option_id" value={selected.id} />
      <label className="font-bold">Minimum quantity<input name="option_minimum_quantity" type="number" min="1" step="1" key={`${selected.id}-min`} defaultValue={selected.minimumQuantity ?? defaultMinimum} required className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
      <label className="font-bold">Maximum quantity<input name="option_maximum_quantity" type="number" min="1" step="1" key={`${selected.id}-max`} defaultValue={selected.maximumQuantity ?? defaultMaximum} required className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
      <div className="flex justify-end sm:col-span-2"><button className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white">Save denomination quantity</button></div>
    </div>}
    {options.some((option) => option.minimumQuantity !== null || option.maximumQuantity !== null) && <section className="mt-8 border-t border-slate-200 pt-6"><h3 className="text-lg font-black">Restricted denominations</h3><div className="mt-4 grid gap-3">{options.filter((option) => option.minimumQuantity !== null || option.maximumQuantity !== null).map((option) => <div key={option.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{option.name}</p><p className="text-sm text-slate-500">Allowed quantity: {option.minimumQuantity ?? defaultMinimum}-{option.maximumQuantity ?? defaultMaximum}</p></div><div className="flex gap-2"><button type="button" onClick={() => setSelectedId(option.id)} className="rounded-lg border border-blue-200 px-4 py-2 font-bold text-blue-700">Edit</button><button formAction={removeDenominationQuantity} formNoValidate name="option_id" value={option.id} className="rounded-lg border border-red-200 px-4 py-2 font-bold text-red-700">Remove</button></div></div>)}</div></section>}
  </form>;
}

