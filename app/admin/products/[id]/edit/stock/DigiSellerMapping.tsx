"use client";

import { useEffect, useState } from "react";
import { createDigiSellerProduct, saveDigiSellerMapping, loadDigiSellerMappingProducts } from "./digiseller-actions";
import CollapsibleAdminSection from "@/components/CollapsibleAdminSection";

type Option = { id: string; name: string; digisellerProductId: number | null; digisellerOptionId: number | null; digisellerVariantId: number | null };
type Product = { id: number; name: string; price: number; currency: string; stock: number; visible: boolean };
type Variant = { optionId: number; variantId: number; name: string };

export default function DigiSellerMapping({ productId, options }: { productId: string; options: Option[] }) {
  return <CollapsibleAdminSection title="Match denominations" description="Connect website denominations to DigiSeller products and variants.">
    <MappingLoader productId={productId} options={options} />
  </CollapsibleAdminSection>;
}

function MappingLoader({ productId, options }: { productId: string; options: Option[] }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await loadDigiSellerMappingProducts();
        if (!active) return;
        if (result.error || !result.products) setError(result.error || "Unable to load DigiSeller products.");
        else setProducts(result.products);
      } catch {
        if (active) setError("Unable to load DigiSeller products. Please try again.");
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }} className="ml-3 min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold">Retry products</button></div>;
  if (!products) return <p role="status" className="text-sm text-slate-500">Fetching DigiSeller products…</p>;
  return <MappingForm productId={productId} options={options} products={products} />;
}

function MappingForm({ productId, options, products, loadError }: {
  productId: string;
  options: Option[];
  products: Product[];
  loadError?: string;
}) {
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>(() => Object.fromEntries(options.map((option) => [option.id, option.digisellerProductId?.toString() ?? ""])));
  const [variants, setVariants] = useState<Record<string, Variant[]>>({});
  async function loadVariants(productId: string) {
    if (!productId || variants[productId]) return;
    const response = await fetch(`/api/admin/digiseller/products/${encodeURIComponent(productId)}/variants`);
    const result = await response.json() as { variants?: Variant[] };
    setVariants((current) => ({ ...current, [productId]: result.variants ?? [] }));
  }
  useEffect(() => { for (const productId of new Set(Object.values(selectedProducts).filter(Boolean))) void loadVariants(productId); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div>
    <form action={createDigiSellerProduct.bind(null, productId)} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <label htmlFor="digiseller-category-url" className="text-sm font-black text-slate-900">Create a new hidden DigiSeller API product</label>
      <p className="mt-1 text-xs text-slate-600">Paste the DigiSeller URL after choosing the marketplace category and attributes.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input id="digiseller-category-url" name="category_url" type="url" required placeholder="https://my.digiseller.com/inside/new_description.asp?..." className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm" />
        <button className="admin-save-action rounded-xl px-5 py-3 text-sm font-black">Create DigiSeller product</button>
      </div>
    </form>
    {loadError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{loadError}</div> :
      <form action={saveDigiSellerMapping.bind(null, productId)} className="mt-5 space-y-3">
        {options.map((option) => <div key={option.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[220px_1fr] sm:items-center">
          <span className="font-black">{option.name}</span>
          <div className="grid gap-2"><select aria-label={`DigiSeller product for ${option.name}`} name={`digiseller_${option.id}`} value={selectedProducts[option.id] ?? ""} onChange={(event) => { const value = event.target.value; setSelectedProducts((current) => ({ ...current, [option.id]: value })); void loadVariants(value); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <option value="">Not connected</option>
            {products.map((product) => <option key={product.id} value={product.id}>
              {product.name} — ID {product.id} — {product.stock} in stock{product.visible ? "" : " — hidden"}
            </option>)}
          </select>
          {(variants[selectedProducts[option.id]]?.length ?? 0) > 0 && <select aria-label={`DigiSeller variant for ${option.name}`} name={`digiseller_variant_${option.id}`} defaultValue={option.digisellerOptionId && option.digisellerVariantId ? `${option.digisellerOptionId}:${option.digisellerVariantId}` : ""} required className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold">
            <option value="">Choose DigiSeller denomination</option>
            {variants[selectedProducts[option.id]].map((variant) => <option key={variant.variantId} value={`${variant.optionId}:${variant.variantId}`}>{variant.name} — Variant {variant.variantId}</option>)}
          </select>}</div>
        </div>)}
        <button className="admin-save-action rounded-xl px-6 py-3 font-black">Save DigiSeller matches</button>
      </form>}
  </div>;
}
