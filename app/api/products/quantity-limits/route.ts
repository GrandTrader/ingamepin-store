import { supplierRangeLimits } from "@/lib/definiteplay-range-stock";
import { productRanges } from "@/lib/product-range-data";
import { NextRequest, NextResponse } from "next/server";

import { UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { supplierProductIds, supplierAvailableQuantity } from "@/lib/definiteplay-fulfillment";

import { privateJson, requestLimit, sameOrigin } from "@/lib/request-security";
import { readJsonBody, RequestBodyError } from "@/lib/read-json-body";

type QuantityRequestItem = {
  productId?: unknown;
  productOptionId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return privateJson({ error: "Invalid request origin." }, 403);
    const limited = await requestLimit(request, "product-stock", 120, 60);
    if (limited) return limited;
    const body = (await readJsonBody(request, 128 * 1024)) as { items?: unknown } | null;
    if (!Array.isArray(body?.items) || body.items.length > 100 || body.items.some(item => !item || typeof item !== "object")) {
      return privateJson({ error: "Send between 1 and 100 cart products." }, 400);
    }
    const items = body.items as QuantityRequestItem[];
    const normalizedItems = items
      .map((item) => ({
        productId: String(item.productId ?? "").trim(),
        productOptionId: String(item.productOptionId ?? "").trim() || null,
      }))
      .filter((item) => item.productId && item.productId.length <= 128 && (item.productOptionId?.length ?? 0) <= 128);

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
    const [productsResult, optionsResult, restrictionsResult] = await Promise.all([
      admin
        .from("products")
        .select("id, currency, minimum_quantity, maximum_quantity, is_bulk_order, stock_quantity, status")
        .in("id", productIds),
      optionIds.length
        ? admin
            .from("product_options")
            .select("id, product_id, denomination_currency, minimum_quantity, maximum_quantity, is_active, is_in_stock")
            .in("id", optionIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("product_purchase_restrictions").select("*").in("product_id", productIds).eq("is_enabled", true),
    ]);

    if (productsResult.error || optionsResult.error || restrictionsResult.error) {
      throw new Error("Unable to load product quantity settings.");
    }

    const products = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
    const options = new Map((optionsResult.data ?? []).map((option) => [option.id, option]));
    if (products.size !== productIds.length || options.size !== optionIds.length) {
      return NextResponse.json({ error: "A cart product is no longer available." }, { status: 400 });
    }

    const supplierProducts = await supplierProductIds(productIds);
    const rangeData=await productRanges(productIds);
    const rangeLimits=await supplierRangeLimits(rangeData.ranges.filter(r=>r.enabled&&r.delivery_mode==="SUPPLIER").map(r=>r.option_id));
    const uniqueItems = [...new Map(normalizedItems.map(item => [JSON.stringify([item.productId, item.productOptionId]), item])).values()];
    const resolveLimit = async (item: (typeof normalizedItems)[number]) => {
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
      const onePerDenomination = (restrictionsResult.data ?? []).some(rule => rule.product_id === product.id && rule.one_per_denomination === true);
      const maximumQuantity = onePerDenomination ? 1 :
        product.is_bulk_order ||
        (option?.maximum_quantity == null && storedMaximum >= UNLIMITED_STOCK_QUANTITY)
          ? null
          : storedMaximum;

      let availableQuantity: number | null = null;
      if (product.status !== 'ACTIVE' || (option && (!option.is_active || option.is_in_stock === false))) availableQuantity = 0;
      else if (rangeData.ranges.some(r=>r.option_id===option?.id&&r.enabled&&r.delivery_mode==="MANUAL")) availableQuantity=null;
      else if (rangeData.ranges.some(r=>r.option_id===option?.id&&r.delivery_mode==="SUPPLIER")) availableQuantity=rangeLimits.get(option!.id)??0;
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
        denominationCurrency: rangeData.ranges.find(range => range.option_id === option?.id)?.currency ?? option?.denomination_currency ?? product.currency,
        productId: item.productId,
        productOptionId: item.productOptionId,
        minimumQuantity,
        maximumQuantity,
        onePerDenomination,
      };
    };
    const limits: Awaited<ReturnType<typeof resolveLimit>>[] = [];
    for (let offset = 0; offset < uniqueItems.length; offset += 5) {
      limits.push(...await Promise.all(uniqueItems.slice(offset, offset + 5).map(resolveLimit)));
    }

    const requiresVerifiedSignIn = Boolean(restrictionsResult.data?.length);
    const user = requiresVerifiedSignIn ? (await (await createClient()).auth.getUser()).data.user : null;
    const verified = Boolean(user?.id && user.email && user.email_confirmed_at);
    return privateJson({ limits, purchaseAccess: { requiresVerifiedSignIn, verified, email: verified ? user!.email : null } });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, error.status);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load quantity settings." },
      { status: 500 },
    );
  }
}
