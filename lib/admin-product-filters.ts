export type AdminProductFilters = {
  q: string;
  status: string;
  sort: string;
  category: string;
  region: string;
  kind: string;
};

export function adminProductPageUrl(page: number, filters: AdminProductFilters) {
  const query = new URLSearchParams();
  for (const key of ["q", "category", "region", "kind"] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  if (filters.status && filters.status !== "ALL") query.set("status", filters.status);
  if (filters.sort && filters.sort !== "ID_DESC") query.set("sort", filters.sort);
  if (page > 1) query.set("page", String(page));
  return "/admin/products" + (query.size ? "?" + query : "");
}

export function matchesAdminProduct(
  product: { category_id: string | null; region: string | null; is_bulk_order: boolean },
  filters: Pick<AdminProductFilters, "category" | "region" | "kind">,
) {
  return (
    (!filters.category || product.category_id === filters.category) &&
    (!filters.region || (product.region || "Global") === filters.region) &&
    (!filters.kind || (filters.kind === "BULK" ? product.is_bulk_order : !product.is_bulk_order))
  );
}
