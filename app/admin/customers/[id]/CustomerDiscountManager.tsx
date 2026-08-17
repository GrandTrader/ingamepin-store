"use client";

import { useState } from "react";
import { saveCustomerDiscount } from "../actions";

type Product = { id: string; name: string; productType: string };
type Discount = { productId: string; discountPercent: number };

export default function CustomerDiscountManager({ customerId, products, discounts }: {
  customerId: string;
  products: Product[];
  discounts: Discount[];
}) {
  const initialDiscounts = new Map(discounts.map((discount) => [discount.productId, discount.discountPercent]));
  const [enabledProducts, setEnabledProducts] = useState(
    () => new Set(discounts.map((discount) => discount.productId)),
  );

  function toggleProduct(productId: string) {
    setEnabledProducts((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  return (
    <form action={saveCustomerDiscount} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="customer_id" value={customerId} />
      <h2 className="text-xl font-black text-slate-950">Manage product discounts</h2>
      <p className="mt-1 text-sm text-slate-500">Enable a product and set this customer&apos;s discount percentage.</p>

      <div className="mt-5 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
        {products.map((product) => {
          const enabled = enabledProducts.has(product.id);
          return (
            <div key={product.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[auto_1fr_9rem] sm:items-center">
              <input
                type="checkbox"
                name="selected_product_ids"
                value={product.id}
                checked={enabled}
                onChange={() => toggleProduct(product.id)}
                className="h-5 w-5 rounded border-slate-300 text-cyan-500"
              />
              <div>
                <p className="font-bold text-slate-950">{product.name}</p>
                <p className="text-xs text-slate-500">{product.productType.replaceAll("_", " ")}</p>
              </div>
              <label className="text-sm font-bold text-slate-700">
                Discount %
                <input
                  type="number"
                  name={`discount_percent_${product.id}`}
                  min="0.01"
                  max="100"
                  step="0.01"
                  defaultValue={initialDiscounts.get(product.id) ?? 1}
                  disabled={!enabled}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </label>
            </div>
          );
        })}
      </div>

      <button type="submit" className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-cyan-600">
        Save customer discounts
      </button>
    </form>
  );
}
