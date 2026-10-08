import { NextRequest } from "next/server";

import { authorizeBulkApi, bulkApiNoStore } from "@/lib/bulk-api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { productPromotions } from "@/lib/product-promotion-data";
import { activePromotion, discountedPrice } from "@/lib/product-promotions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await authorizeBulkApi(request);
  if (auth.error) return auth.error;

  const result = await createAdminClient()
    .from("products")
    .select("id, name, slug, currency, minimum_quantity, maximum_quantity, bulk_delivery_instructions, product_options(id, option_name, denomination, denomination_currency, selling_price, minimum_quantity, maximum_quantity, is_active, is_in_stock)")
    .eq("status", "ACTIVE").eq("business_enabled", true)
    .eq("delivery_type", "MANUAL")
    .eq("is_bulk_order", true)
    .order("sort_order", { ascending: true });

  if (result.error) {
    return bulkApiNoStore({ error: "Unable to load bulk products." }, { status: 500 });
  }

  const promotions=await productPromotions((result.data??[]).map(p=>p.id));
  const products = (result.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    currency: product.currency,
    delivery: "MANUAL",
    minimumQuantity: product.minimum_quantity,
    maximumQuantity: product.maximum_quantity,
    deliveryInstructions: product.bulk_delivery_instructions,
    options: (product.product_options ?? [])
      .filter((option) => option.is_active && option.is_in_stock !== false)
      .map((option) => ({
        id: option.id,
        name: option.option_name,
        denomination: option.denomination,
        denominationCurrency: option.denomination_currency,
        regularUnitPrice: Number(option.selling_price),
        unitPrice: discountedPrice(Number(option.selling_price),activePromotion(promotions.rows.find(p=>p.product_id===product.id)?.rules,option.id)?.percent??0),
        sale: activePromotion(promotions.rows.find(p=>p.product_id===product.id)?.rules,option.id),
        minimumQuantity: option.minimum_quantity,
        maximumQuantity: option.maximum_quantity,
      })),
  }));

  return bulkApiNoStore({ products });
}
