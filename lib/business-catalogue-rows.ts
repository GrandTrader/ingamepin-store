import type { PortalOption, PortalProduct } from "./business-portal";
import type { ProductRange } from "./product-range";

export type CatalogueRow = { product: PortalProduct; option: PortalOption; range?: ProductRange };

export function businessCatalogueRows(products: PortalProduct[], ranges: ProductRange[] = []): CatalogueRow[] {
  const enabledRanges = new Map(ranges.filter(range => range.enabled).map(range => [range.option_id, range]));
  const faceValue = (option: PortalOption) => {
    const amount = option.denomination == null ? Infinity : Number(option.denomination);
    return Number.isFinite(amount) ? amount : Infinity;
  };
  return products.flatMap(product => product.product_options
    .filter(option => option.is_active)
    .slice()
    .sort((a, b) => Number(enabledRanges.has(b.id)) - Number(enabledRanges.has(a.id)) || faceValue(a) - faceValue(b))
    .map(option => ({ product, option, range: enabledRanges.get(option.id) })));
}
