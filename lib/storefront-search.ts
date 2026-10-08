export function storefrontSearchQuery(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.replace(/\p{Cc}/gu, " ").trim().replace(/\s+/g, " ").slice(0, 100) : "";
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/['’‘`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matchesStorefrontSearch(values: Array<string | number | null | undefined>, query: string) {
  const clean = storefrontSearchQuery(query);
  if (!clean) return true;
  const words = normalize(clean).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const text = values.map(value => normalize(String(value ?? ""))).join(" ");
  return words.every(word => text.includes(word));
}

type Category = { name?: string | null; short_name?: string | null; slug?: string | null };
type SearchProduct = {
  name: string; name_ru?: string | null; public_id?: string | number; region?: string | null;
  categories?: Category | Category[] | null;
  product_options?: { option_name?: string | null; platform?: string | null; is_active?: boolean }[] | null;
};

export function matchesStorefrontProduct(product: SearchProduct, query: string) {
  const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  return matchesStorefrontSearch([
    product.name, product.name_ru, product.public_id, product.region,
    category?.name, category?.short_name, category?.slug,
    ...(product.product_options ?? []).filter(option => option.is_active !== false)
      .flatMap(option => [option.option_name, option.platform]),
  ], query);
}
