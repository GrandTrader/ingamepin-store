import { NextResponse } from "next/server";
import { getStoreCategories, getStoreProducts } from "@/lib/store-catalogue";
export async function GET() {
  const [categories, products] = await Promise.all([getStoreCategories(), getStoreProducts()]);
  const sales = new Map<string, number>();
  for (const product of products) {
    const available = product.is_bulk_order || Number(product.stock_quantity) !== 0 ||
      (product.product_options ?? []).some(option => option.is_active && option.is_in_stock !== false && Number(option.stock_quantity) !== 0);
    if (available && product.category_id) sales.set(product.category_id, (sales.get(product.category_id) ?? 0) + Number(product.sold_count || 0));
  }
  return NextResponse.json({
    categories: categories.map(({ id, name, slug }) => ({ id, name, slug })),
    featured: categories.filter(category => sales.has(category.id)).map(category => ({
      id: category.id, name: category.name, shortName: category.short_name, slug: category.slug,
      icon: category.icon, sales: sales.get(category.id) ?? 0,
    })).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name)).slice(0, 10),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
