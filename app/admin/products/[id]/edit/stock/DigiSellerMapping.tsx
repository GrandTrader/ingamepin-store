"use client";

import { saveDigiSellerMapping } from "./digiseller-actions";

type Option = { id: string; name: string; digisellerProductId: number | null };
type Product = { id: number; name: string; price: number; currency: string; stock: number; visible: boolean };

export default function DigiSellerMapping({ productId, options, products, loadError }: {
  productId: string;
  options: Option[];
  products: Product[];
  loadError?: string;
}) {
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-blue-600">DigiSeller connection</p>
      <h2 className="mt-2 text-xl font-black">Match denominations</h2>
      <p className="mt-1 text-sm text-slate-500">Choose the DigiSeller product that represents each website denomination.</p>
    </div>
    {loadError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{loadError}</div> :
      <form action={saveDigiSellerMapping.bind(null, productId)} className="mt-5 space-y-3">
        {options.map((option) => <label key={option.id} className="grid gap-2 rounded-xl border border-slate-200 p-4 sm:grid-cols-[220px_1fr] sm:items-center">
          <span className="font-black">{option.name}</span>
          <select name={`digiseller_${option.id}`} defaultValue={option.digisellerProductId?.toString() ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <option value="">Not connected</option>
            {products.map((product) => <option key={product.id} value={product.id}>
              {product.name} — ID {product.id} — {product.stock} in stock{product.visible ? "" : " — hidden"}
            </option>)}
          </select>
        </label>)}
        <button className="admin-save-action rounded-xl px-6 py-3 font-black">Save DigiSeller matches</button>
      </form>}
  </section>;
}
