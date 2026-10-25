import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { getWupexFilterPage, validateWupexCredentials, WupexError } from "./wupex-api";
import type { WupexCredentials, WupexCatalogFilters } from "./wupex-types";

export async function collectWupexCatalogFilters(credentials: WupexCredentials): Promise<WupexCatalogFilters> {
  const deadline = Date.now() + 45000;
  const first = await getWupexFilterPage(credentials, 1);
  const categories = new Set(first.categories), regions = new Set(first.regions);
  let count = first.count;
  // Four bounded reads at a time leave relay capacity for orders and other admins.
  for (let start = 2; start <= first.totalPages; start += 4) {
    if (Date.now() > deadline) throw new WupexError("Category and region lists took too long. Please retry.");
    const pages = await Promise.all(Array.from({ length: Math.min(4, first.totalPages - start + 1) }, (_, offset) => getWupexFilterPage(credentials, start + offset)));
    for (const page of pages) {
      if (page.totalPages !== first.totalPages || page.totalCount !== first.totalCount) throw new WupexError("The supplier catalogue changed. Please reload the filters.");
      page.categories.forEach(value => categories.add(value));
      page.regions.forEach(value => regions.add(value));
      count += page.count;
    }
  }
  if (count !== first.totalCount) throw new WupexError("The complete category list could not be loaded. Please retry.");
  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, "en"));
  return { categories: sorted(categories), regions: sorted(regions) };
}

const pending = new Map<string, Promise<WupexCatalogFilters>>();
export async function getCachedWupexCatalogFilters(credentials: WupexCredentials): Promise<WupexCatalogFilters> {
  const c = validateWupexCredentials(credentials);
  // Only names are cached. Prices and stock keep their existing live checks.
  const scope = createHash("sha256").update(JSON.stringify([c.baseUrl, c.merchantCode, c.apiKey])).digest("hex");
  const existing = pending.get(scope);
  if (existing) return existing;
  const task = unstable_cache(() => collectWupexCatalogFilters(c), ["wupex-catalog-filters-v1", scope], { revalidate: 900 })();
  pending.set(scope, task);
  try { return await task; } finally { pending.delete(scope); }
}
