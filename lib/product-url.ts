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

// Public affiliate links must never fall back to an internal supplier slug.
export function getAffiliateProductPath(product: {
  public_id: number | string;
  categories: { slug: string; public_id: number | string } | { slug: string; public_id: number | string }[] | null;
}, affiliateCode: string) {
  const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  if (!category?.slug || !/^\d{9}$/.test(String(category.public_id)) || !/^\d{9}$/.test(String(product.public_id))) return null;
  return `${getProductUrl({categorySlug:category.slug,categoryPublicId:category.public_id,productPublicId:product.public_id})}?ref=${encodeURIComponent(affiliateCode)}`;
}
