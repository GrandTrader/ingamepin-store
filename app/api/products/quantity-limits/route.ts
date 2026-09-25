import { NextRequest, NextResponse } from "next/server";

import { UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";
import { createAdminClient } from "@/lib/supabase/admin";
import { supplierProductIds, supplierAvailableQuantity } from "@/lib/definiteplay-fulfillment";

type QuantityRequestItem = {
  productId?: unknown;
  productOptionId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { items?: unknown };
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 100).map((value) => value as QuantityRequestItem)
      : [];
    const normalizedItems = items
      .map((item) => ({
        productId: String(item.productId ?? "").trim(),
        productOptionId: String(item.productOptionId ?? "").trim() || null,
      }))
      .filter((item) => item.productId);

    if (normalizedItems.length === 0 || normalizedItems.length !== items.length) {
      return NextResponse.json({ error: "The cart products are invalid." }, { status: 400 });
    }

    const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
    const optionIds = [
      ...new Set(
        normalizedItems
          .map((item) => item.productOptionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const admin = createAdminClient();
    const [productsResult, optionsResult] = await Promise.all([
      admin
        .from("products")
        .select("id, minimum_quantity, maximum_quantity, is_bulk_order, stock_quantity, status")
        .in("id", productIds),
      optionIds.length
        ? admin
            .from("product_options")
            .select("id, product_id, minimum_quantity, maximum_quantity, is_active, is_in_stock")
            .in("id", optionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsResult.error || optionsResult.error) {
      throw new Error("Unable to load product quantity settings.");
    }

    const products = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
    const options = new Map((optionsResult.data ?? []).map((option) => [option.id, option]));
    if (products.size !== productIds.length || options.size !== optionIds.length) {
      return NextResponse.json({ error: "A cart product is no longer available." }, { status: 400 });
    }

    const supplierProducts = await supplierProductIds(productIds);
    const limits = await Promise.all(normalizedItems.map(async (item) => {
      const product = products.get(item.productId)!;
      const option = item.productOptionId ? options.get(item.productOptionId) : null;
      if (option && option.product_id !== product.id) {
        throw new Error("A product denomination is invalid.");
      }

      const minimumQuantity = Math.max(
        Number(product.minimum_quantity ?? 1),
        Number(option?.minimum_quantity ?? 1),
      );
      const storedMaximum = Number(option?.maximum_quantity ?? product.maximum_quantity);
      const maximumQuantity =
        product.is_bulk_order ||
        (option?.maximum_quantity == null && storedMaximum >= UNLIMITED_STOCK_QUANTITY)
          ? null
          : storedMaximum;

      let availableQuantity: number | null = null;
      if (product.status !== 'ACTIVE' || (option && (!option.is_active || option.is_in_stock === false))) availableQuantity = 0;
      else if (supplierProducts.has(product.id)) {
        availableQuantity = option ? await supplierAvailableQuantity(option.id) : 0;
      }
      else if (product.stock_quantity !== UNLIMITED_STOCK_QUANTITY) {
        let query = admin.from('gift_card_codes').select('id', { count: 'exact', head: true }).eq('product_id', product.id).eq('status', 'AVAILABLE');
        if (option) query = query.eq('product_option_id', option.id);
        const count = await query;
        if (count.error) throw new Error('Unable to check current stock.');
        availableQuantity = count.count ?? 0;
      }
      return {
        availableQuantity,
        productId: item.productId,
        productOptionId: item.productOptionId,
        minimumQuantity,
        maximumQuantity,
      };
    }));

    return NextResponse.json({ limits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load quantity settings." },
      { status: 500 },
    );
  }
}
