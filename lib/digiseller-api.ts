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

type DigiSellerApiResult = {
  retval?: number;
  retdesc?: unknown;
  content?: unknown;
  product_id?: number;
  id?: number;
  errors?: unknown;
};

function digiSellerErrorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(digiSellerErrorText).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const field = digiSellerErrorText(record.field || record.property || record.code);
    const message = digiSellerErrorText(record.message || record.error || record.description);
    if (field || message) return [field, message].filter(Boolean).join(": ");
    try { return JSON.stringify(value); } catch { return "Unknown DigiSeller validation error"; }
  }
  return "";
}

async function postDigiSeller(path: string, body: unknown): Promise<DigiSellerApiResult> {
  const { token } = await getDigiSellerToken();
  const response = await fetch(`https://api.digiseller.com${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as DigiSellerApiResult | null;
  const details = digiSellerErrorText(result?.errors) || digiSellerErrorText(result?.retdesc);
  if (!response.ok) throw new Error(details || `DigiSeller request failed (${response.status}).`);
  if (!result || (typeof result.retval === "number" && result.retval !== 0)) {
    throw new Error(details || "DigiSeller rejected the request.");
  }
  return result;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type DigiSellerCategory = {
  ownerId: number;
  categoryId: number;
  attributes: Array<{ attribute_id: number; attribute_value_id: number }>;
};

export function parseDigiSellerCategoryUrl(rawUrl: string): DigiSellerCategory {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Paste a valid DigiSeller category URL."); }
  if (url.protocol !== "https:" || url.hostname !== "my.digiseller.com") throw new Error("Use a my.digiseller.com category URL.");
  const ownerId = positiveId(url.searchParams.get("ownerId"));
  const categoryId = positiveId(url.searchParams.get("categoryId"));
  if (!ownerId || !categoryId) throw new Error("The DigiSeller URL is missing its category information.");
  let attributes: DigiSellerCategory["attributes"] = [];
  try {
    const parsed = JSON.parse(url.searchParams.get("selectedAttributes") || "[]") as Array<{ attribute_id?: unknown; attribute_value_id?: unknown }>;
    if (!Array.isArray(parsed)) throw new Error();
    attributes = parsed.map((item) => {
      const attributeId = positiveId(item.attribute_id);
      const attributeValueId = positiveId(item.attribute_value_id);
      if (!attributeId || !attributeValueId) throw new Error();
      return { attribute_id: attributeId, attribute_value_id: attributeValueId };
    });
  } catch { throw new Error("The DigiSeller category attributes are invalid."); }
  return { ownerId, categoryId, attributes };
}

export async function createDigiSellerFormProduct(input: {
  name: string;
  nameRu?: string | null;
  description: string;
  descriptionRu?: string | null;
  basePrice: number;
  category: DigiSellerCategory;
  variants: Array<{ name: string; price: number }>;
}) {
  const created = await postDigiSeller("/api/product/create/arbitrary", {
    content_type: "form",
    name: [{ locale: "en-US", value: input.name }, ...(input.nameRu ? [{ locale: "ru-RU", value: input.nameRu }] : [])],
    description: [{ locale: "en-US", value: input.description }, ...(input.descriptionRu ? [{ locale: "ru-RU", value: input.descriptionRu }] : [])],
    add_info: [{ locale: "en-US", value: "Delivery is completed automatically after payment." }],
    price: { price: input.basePrice, currency: "USD" },
    affiliate_program: 2,
    comission_partner: 0,
    categories: [{
      owner: input.category.ownerId,
      cataloguer_category_id: input.category.categoryId,
      cataloguer_attributes: input.category.attributes,
    }],
    bonus: { enabled: false, percent: 0 },
    guarantee: { enabled: false, value: 0 },
    address_required: false,
    pay_as_you_want: false,
  });
  const content = created.content as { product_id?: unknown; id?: unknown } | number | undefined;
  const productId = positiveId(created.product_id) || positiveId(created.id) || positiveId(content) ||
    (typeof content === "object" && content ? positiveId(content.product_id) || positiveId(content.id) : null);
  if (!productId) throw new Error("DigiSeller created the product but did not return its ID.");

  await postDigiSeller("/api/products/options", {
    product_id: productId,
    name: [{ locale: "en-US", value: "Denomination" }, { locale: "ru-RU", value: "Номинал" }],
    type: "radio",
    order: 1,
    required: true,
    separate_content: false,
    modifier_visible: false,
    variants: input.variants.map((variant, index) => ({
      name: [{ locale: "en-US", value: variant.name }],
      type: "priceplus",
      rate: Math.max(0, Number((variant.price - input.basePrice).toFixed(2))),
      default: index === 0,
      order: index + 1,
    })),
  });

  const supplierUrl = "https://www.ingamepin.com/api/digiseller/supplier";
  await postDigiSeller("/api/product/content/update/form", {
    product_id: productId,
    address: supplierUrl,
    method: "JSON",
    encoding: "UTF8",
    options: true,
    answer: true,
    allow_purchase_multiple_items: "true",
    url_for_quantity: supplierUrl,
  });
  return { productId, variants: await listDigiSellerVariants(productId) };
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
