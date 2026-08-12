export type ProductUrlData = {
  categorySlug: string;
  categoryPublicId: number | string;
  productPublicId: number | string;
};

function publicId(value: number | string) {
  return encodeURIComponent(String(value));
}

export function getProductUrl(product: ProductUrlData) {
  return `/category/${encodeURIComponent(product.categorySlug)}/${publicId(
    product.categoryPublicId,
  )}/subcategory/${publicId(product.productPublicId)}`;
}
