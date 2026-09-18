import type { ComponentProps } from "react";
import { listDigiSellerProducts } from "@/lib/digiseller-api";
import DigiSellerMapping from "./DigiSellerMapping";

export default async function DigiSellerConnection({ productId, options }: Pick<ComponentProps<typeof DigiSellerMapping>, "productId" | "options">) {
  const result = await listDigiSellerProducts(AbortSignal.timeout(10000))
    .then((products) => ({ products, error: undefined }))
    .catch(() => ({ products: [], error: "DigiSeller is currently unavailable. Refresh to retry. You can still add stock above." }));
  return <DigiSellerMapping productId={productId} options={options} products={result.products} loadError={result.error} />;
}
