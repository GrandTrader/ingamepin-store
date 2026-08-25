import "server-only";

import { createHash } from "node:crypto";

type DigiSellerLoginResponse = {
  retval?: number;
  retdesc?: string | null;
  token?: string;
};

export type DigiSellerProduct = {
  id: number;
  name: string;
  price: number;
  currency: string;
  stock: number;
  visible: boolean;
};

type DigiSellerProductsResponse = {
  retval?: number;
  retdesc?: string | null;
  rows?: Array<{
    id_goods?: number;
    name_goods?: string;
    price?: number;
    currency?: string;
    num_in_stock?: number;
    visible?: number;
  }>;
};

function credentials() {
  const sellerId = Number(process.env.DIGISELLER_SELLER_ID?.trim());
  const apiKey = process.env.DIGISELLER_API_KEY?.trim();
  if (!Number.isSafeInteger(sellerId) || sellerId <= 0 || !apiKey) {
    throw new Error("DigiSeller API credentials are not configured.");
  }
  return { sellerId, apiKey };
}

export async function getDigiSellerToken() {
  const { sellerId, apiKey } = credentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = createHash("sha256").update(`${apiKey}${timestamp}`).digest("hex");
  const response = await fetch("https://api.digiseller.com/api/apilogin", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ seller_id: sellerId, timestamp, sign }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`DigiSeller login failed (${response.status}).`);
  const result = (await response.json()) as DigiSellerLoginResponse;
  if (result.retval !== 0 || !result.token) {
    throw new Error(result.retdesc || "DigiSeller did not return an access token.");
  }
  return { token: result.token, sellerId };
}

export type DigiSellerVariant = {
  optionId: number;
  variantId: number;
  name: string;
};

export async function listDigiSellerVariants(productId: number): Promise<DigiSellerVariant[]> {
  const { token } = await getDigiSellerToken();
  const listResponse = await fetch(`https://api.digiseller.com/api/products/options/list/${productId}?token=${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" }, cache: "no-store",
  });
  if (!listResponse.ok) throw new Error("Unable to load DigiSeller parameters.");
  const list = await listResponse.json() as { retval?: number; retdesc?: string; content?: Array<{ id?: number }> };
  if (list.retval !== 0) throw new Error(list.retdesc || "Unable to load DigiSeller parameters.");
  const details = await Promise.all((list.content ?? []).map(async (option) => {
    const optionId = Number(option.id);
    const response = await fetch(`https://api.digiseller.com/api/products/options/${optionId}?token=${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" }, cache: "no-store",
    });
    if (!response.ok) return [];
    const result = await response.json() as { content?: { variants?: Array<{ variant_id?: number; name?: Array<{ locale?: string; value?: string }> }> } };
    return (result.content?.variants ?? []).flatMap((variant) => {
      const variantId = Number(variant.variant_id);
      if (!Number.isSafeInteger(variantId) || variantId <= 0) return [];
      const names = variant.name ?? [];
      const name = names.find((item) => item.locale === "en-US")?.value || names[0]?.value || `Variant ${variantId}`;
      return [{ optionId, variantId, name }];
    });
  }));
  return details.flat();
}

export async function listDigiSellerProducts(): Promise<DigiSellerProduct[]> {
  const { token, sellerId } = await getDigiSellerToken();
  const response = await fetch(`https://api.digiseller.com/api/seller-goods?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      id_seller: sellerId,
      order_col: "name",
      order_dir: "asc",
      rows: 1000,
      page: 1,
      currency: "USD",
      lang: "en-US",
      show_hidden: 1,
      owner_id: null,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Unable to load DigiSeller products (${response.status}).`);
  const result = (await response.json()) as DigiSellerProductsResponse;
  if (result.retval !== 0) throw new Error(result.retdesc || "Unable to load DigiSeller products.");
  return (result.rows ?? []).flatMap((row) => {
    const id = Number(row.id_goods);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    return [{
      id,
      name: String(row.name_goods ?? `Product ${id}`),
      price: Number(row.price ?? 0),
      currency: String(row.currency ?? "USD"),
      stock: Number(row.num_in_stock ?? 0),
      visible: Number(row.visible ?? 0) === 1,
    }];
  });
}
