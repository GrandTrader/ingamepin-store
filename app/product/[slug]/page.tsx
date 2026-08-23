import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductPurchaseForm from "./ProductPurchaseForm";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import LocalizedProductText from "@/components/LocalizedProductText";
import ProductViewTracker from "@/components/ProductViewTracker";
import AffiliateReferralTracker from "@/components/AffiliateReferralTracker";
import { isUnlimitedStock } from "@/lib/product-stock";
import { getProductUrl } from "@/lib/product-url";
import ProductDetailsTabs from "@/components/ProductDetailsTabs";
import LocalizedProductImage from "@/components/LocalizedProductImage";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    ref?: string | string[];
  }>;
};

type CategoryRelation =
  | {
      name: string;
      slug: string;
      public_id: number | string;
    }
  | {
      name: string;
      slug: string;
      public_id: number | string;
    }[]
  | null;

type ProductRow = {
  id: string;
  public_id: number | string;
  name: string;
  name_ru: string | null;
  slug: string;
  description: string | null;
  description_ru: string | null;
  image_url: string | null;
  image_url_ru: string | null;
  region: string;
  currency: string;
  badge: string | null;
  badge_ru: string | null;
  is_bulk_order: boolean;
  bulk_delivery_instructions: string | null;
  product_type: string;
  delivery_type: string;
  delivery_instructions: string | null;
  allows_fixed_values: boolean;
  allows_custom_value: boolean;
  minimum_custom_value: number | string | null;
  maximum_custom_value: number | string | null;
  allows_player_id_topup: boolean;
  allows_gaming_voucher: boolean;
  player_id_label: string | null;
  minimum_quantity: number;
  maximum_quantity: number;
  stock_quantity: number;
  affiliate_enabled: boolean;
  affiliate_commission_percent: number | string;
  categories: CategoryRelation;
};

type ProductCustomerFieldRow = {
  id: string;
  label: string;
  placeholder: string | null;
  field_type: "TEXT" | "EMAIL" | "NUMBER" | "TEXTAREA";
  is_required: boolean;
};

type ProductOptionRow = {
  id: string;
  option_name: string;
  platform: string | null;
  denomination: number | string | null;
  selling_price: number | string;
  stock_quantity: number;
  is_custom_value: boolean;
  minimum_quantity: number | null;
  maximum_quantity: number | null;
  is_in_stock: boolean;
};

function getCategory(category: CategoryRelation) {
  const value = Array.isArray(category) ? category[0] : category;

  return {
    name: value?.name ?? "Digital Products",
    slug: value?.slug ?? "all-products",
    publicId: value?.public_id ?? 0,
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { slug } = await params;
  return renderProductPage({ slug, searchParams });
}

export async function renderProductPage({
  slug,
  searchParams,
  canonicalRequest = false,
}: {
  slug: string;
  searchParams: ProductPageProps["searchParams"];
  canonicalRequest?: boolean;
}) {
  const query = await searchParams;
  const affiliateCode = Array.isArray(query.ref)
    ? query.ref[0]?.trim()
    : query.ref?.trim();
  const supabase = await createClient();

  const productResult = await supabase
    .from("products")
    .select(
      `
        id,
        public_id,
        name,
        name_ru,
        slug,
        description,
        description_ru,
        image_url,
        image_url_ru,
        region,
        currency,
        badge,
        badge_ru,
        is_bulk_order,
        bulk_delivery_instructions,
        product_type,
        delivery_type,
        delivery_instructions,
        allows_fixed_values,
        allows_custom_value,
        minimum_custom_value,
        maximum_custom_value,
        allows_player_id_topup,
        allows_gaming_voucher,
        player_id_label,
        minimum_quantity,
        maximum_quantity,
        stock_quantity,
        affiliate_enabled,
        affiliate_commission_percent,
        categories (
          name,
          slug,
          public_id
        )
      `,
    )
    .eq("slug", slug)
    .eq("status", "ACTIVE")
    .eq("is_preorder_only", false)
    .maybeSingle();

  if (productResult.error) {
    throw new Error(
      `Unable to load product: ${productResult.error.message}`,
    );
  }

  if (!productResult.data) {
    notFound();
  }

  const product = productResult.data as ProductRow;

  const optionResult = await supabase
    .from("product_options")
    .select(
      `
        id,
        option_name,
        platform,
        denomination,
        selling_price,
        stock_quantity,
        is_custom_value
        ,minimum_quantity,
        maximum_quantity,
        is_in_stock
      `,
    )
    .eq("product_id", product.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (optionResult.error) {
    throw new Error(
      `Unable to load product options: ${optionResult.error.message}`,
    );
  }

  const customerFieldResult = await supabase
    .from("product_customer_fields")
    .select("id, label, placeholder, field_type, is_required")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  if (customerFieldResult.error) {
    throw new Error(`Unable to load customer fields: ${customerFieldResult.error.message}`);
  }

  const customerFields = (customerFieldResult.data ?? []) as ProductCustomerFieldRow[];
  const options = (optionResult.data ?? []) as ProductOptionRow[];
  const category = getCategory(product.categories);

  const admin = createAdminClient();
  const reviewItemResult = await admin
    .from("order_items")
    .select("order_id")
    .eq("product_id", product.id);

  if (reviewItemResult.error) {
    throw new Error(
      `Unable to load product review orders: ${reviewItemResult.error.message}`,
    );
  }

  const reviewOrderIds = Array.from(
    new Set(
      (reviewItemResult.data ?? [])
        .map((item) => item.order_id as string | null)
        .filter((orderId): orderId is string => Boolean(orderId)),
    ),
  );
  const reviewResult = reviewOrderIds.length
    ? await admin
        .from("order_reviews")
        .select("id, customer_email, sentiment, comment, created_at")
        .in("order_id", reviewOrderIds)
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };

  if (reviewResult.error) {
    throw new Error(
      `Unable to load product reviews: ${reviewResult.error.message}`,
    );
  }

  const productReviews = (reviewResult.data ?? []).map((review) => {
    const email = String(review.customer_email ?? "");
    const [localPart = "Customer"] = email.split("@");
    const customerLabel =
      localPart.length > 2
        ? `${localPart.slice(0, 2)}${"*".repeat(Math.min(localPart.length - 2, 6))}`
        : "Verified customer";

    return {
      id: String(review.id),
      sentiment: review.sentiment as "POSITIVE" | "NEGATIVE",
      comment: review.comment ? String(review.comment) : null,
      customerLabel,
      createdAt: String(review.created_at),
    };
  });
  const positiveReviewCount = productReviews.filter(
    (review) => review.sentiment === "POSITIVE",
  ).length;
  const negativeReviewCount = productReviews.length - positiveReviewCount;

  if (!canonicalRequest) {
    const canonicalUrl = getProductUrl({
      categorySlug: category.slug,
      categoryPublicId: category.publicId,
      productPublicId: product.public_id,
    });
    const referral = affiliateCode
      ? `?ref=${encodeURIComponent(affiliateCode)}`
      : "";
    permanentRedirect(`${canonicalUrl}${referral}`);
  }

  const salesResult = await admin
    .from("order_items")
    .select("quantity, orders!inner(status)")
    .eq("product_id", product.id)
    .in("orders.status", ["PAID", "PROCESSING", "DELIVERED"]);

  if (salesResult.error) {
    throw new Error(`Unable to load product sales: ${salesResult.error.message}`);
  }

  const soldCount = (salesResult.data ?? []).reduce(
    (total, item) => total + Number(item.quantity || 0),
    0,
  );
  const customerDiscounts = await getSignedInCustomerDiscounts();
  const customerDiscountPercent = customerDiscounts.get(product.id) ?? 0;
  let affiliateCommissionPercent = 0;
  let affiliateMaximumCommissionPercent = 0;

  const configuredAffiliateMaximum = Number(
    product.affiliate_commission_percent,
  );

  if (
    product.affiliate_enabled &&
    Number.isFinite(configuredAffiliateMaximum) &&
    configuredAffiliateMaximum > 0
  ) {
    const settingsResult = await admin
      .from("affiliate_settings")
      .select("program_enabled")
      .eq("id", 1)
      .maybeSingle();

    if (settingsResult.data?.program_enabled) {
      affiliateMaximumCommissionPercent = configuredAffiliateMaximum;
    }

    if (affiliateCode && settingsResult.data?.program_enabled) {
      const affiliateResult = await admin
        .from("affiliate_accounts")
        .select("id, commission_override_percent")
        .eq("affiliate_code", affiliateCode.toUpperCase())
        .eq("status", "APPROVED")
        .maybeSingle();
      const affiliate = affiliateResult.data;

      if (!affiliate) {
        affiliateMaximumCommissionPercent = configuredAffiliateMaximum;
      } else {
        const selectedRateResult = await admin
          .from("affiliate_product_rates")
          .select("commission_percent")
          .eq("affiliate_id", affiliate.id)
          .eq("product_id", product.id)
          .maybeSingle();
        const maximumRate = Number(
          affiliate.commission_override_percent ??
            product.affiliate_commission_percent,
        );
        const selectedRate = Number(
          selectedRateResult.data?.commission_percent ?? maximumRate,
        );

        if (
          Number.isFinite(maximumRate) &&
          Number.isFinite(selectedRate) &&
          maximumRate > 0
        ) {
          affiliateCommissionPercent = Math.min(
            Math.max(selectedRate, 0),
            maximumRate,
          );
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 sm:py-10">
      <ProductViewTracker productId={product.id} />
      {affiliateCode && (
        <AffiliateReferralTracker
          affiliateCode={affiliateCode}
          productId={product.id}
        />
      )}
      <div className="mx-auto max-w-6xl">
        <nav className="flex flex-nowrap items-center gap-1.5 overflow-hidden text-xs text-slate-400 sm:flex-wrap sm:gap-2 sm:text-sm">
          <Link href="/" className="transition hover:text-cyan-400">
            Home
          </Link>
          <span>/</span>
          <Link
            href={`/category/${category.slug}`}
            className="transition hover:text-cyan-400"
          >
            {category.name}
          </Link>
          <span>/</span>
          <span className="truncate text-white">
            <LocalizedProductText
              english={product.name}
              russian={product.name_ru}
            />
          </span>
        </nav>

        <div className="mt-4 grid gap-4 sm:mt-8 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="contents">
            <div className="relative order-1 w-full max-w-[380px] justify-self-center overflow-hidden rounded-2xl border border-white/10 bg-slate-950 sm:rounded-3xl lg:col-start-1 lg:row-start-1">
              <span className={`absolute bottom-4 left-4 z-20 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider shadow-2xl sm:bottom-6 sm:left-6 sm:text-sm ${product.delivery_type === "AUTOMATIC" ? "border border-emerald-200 bg-emerald-400 text-slate-950" : product.is_bulk_order ? "border border-amber-200 bg-amber-300 text-slate-950" : "border border-white/20 bg-slate-950/90 text-white"}`}>
                  <span aria-hidden="true">◆</span>
                  <LocalizedProductText
                    english={product.delivery_type === "AUTOMATIC" ? "Instant Delivery" : "Digital Delivery"}
                    russian={product.delivery_type === "AUTOMATIC" ? "Мгновенная доставка" : "Цифровая доставка"}
                  />
                </span>

              <LocalizedProductImage
                imageUrl={product.image_url}
                imageUrlRu={product.image_url_ru}
                alt={product.name}
                altRu={product.name_ru}
                className="aspect-square w-full bg-slate-950 object-contain object-center"
                fallback={
                  <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-500 text-7xl font-black">
                    {product.name.charAt(0).toUpperCase()}
                  </div>
                }
              />
            </div>

            <div className="order-3 rounded-2xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl sm:p-8 lg:col-start-1 lg:row-start-2">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-400 sm:text-sm">
                {category.name}
              </p>

              <h1 className="mt-2 text-2xl font-black sm:mt-3 sm:text-4xl">
                <LocalizedProductText
                  english={product.name}
                  russian={product.name_ru}
                />
              </h1>

              <div className="mt-4 flex flex-wrap gap-2 text-xs sm:mt-5 sm:gap-3 sm:text-sm">
                <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1.5">
                  <LocalizedProductText english="Region" russian="Регион" />:{" "}
                  {product.region}
                </span>
                <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1.5">
                  <LocalizedProductText
                    english={product.delivery_type === "AUTOMATIC" ? "Instant Delivery" : "Digital Delivery"}
                    russian={product.delivery_type === "AUTOMATIC" ? "Мгновенная доставка" : "Цифровая доставка"}
                  />
                </span>
                <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1.5">
                  <LocalizedProductText english={`${soldCount} Sold`} russian={`Продано: ${soldCount}`} />
                </span>
              </div>

              {product.delivery_type === "MANUAL" && !product.is_bulk_order && (
                <div className="mt-5 rounded-2xl border border-cyan-300 bg-cyan-50 p-4 sm:mt-7 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">◆</span>
                    <span>
                      <span className="block text-sm font-black text-cyan-950 sm:text-base">
                        <LocalizedProductText english="Digital delivery information" russian="Информация о цифровой доставке" />
                      </span>
                      <span className="mt-1 block whitespace-pre-line text-sm font-medium leading-6 text-slate-800">
                        {product.delivery_instructions || (
                          <LocalizedProductText
                            english="Digital delivery is completed by the admin after successful payment confirmation."
                            russian="Цифровая доставка выполняется администратором после успешного подтверждения оплаты."
                          />
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {product.is_bulk_order && (
                  <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:mt-7 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300 font-black text-slate-950"
                      >
                        ◆
                      </span>
                      <span>
                        <span className="block text-sm font-black text-amber-950 sm:text-base">
                          <LocalizedProductText
                            english="Digital delivery information"
                            russian="Информация о цифровой доставке"
                          />
                        </span>
                        <span className="mt-1 block whitespace-pre-line text-sm font-medium leading-6 text-slate-800">
                          {product.bulk_delivery_instructions || "Digital Delivery Time: 1-15 Working Days"}
                        </span>
                      </span>
                    </div>
                  </div>
                )}

              <ProductDetailsTabs
                description={
                  product.description ??
                  "Product details and delivery information will be provided with your order."
                }
                descriptionRu={product.description_ru}
                deliveryInstructions={product.delivery_instructions}
                reviews={productReviews}
                positiveCount={positiveReviewCount}
                negativeCount={negativeReviewCount}
              />
            </div>
          </div>

          <aside className="order-2 h-fit rounded-2xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <p className="text-xs font-bold text-cyan-400 sm:text-sm">
              <LocalizedProductText
                english="Secure checkout"
                russian="Безопасное оформление"
              />
            </p>
            <h2 className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
              <LocalizedProductText
                english="Choose your product option"
                russian="Выберите вариант товара"
              />
            </h2>

            <ProductPurchaseForm
              product={{
                id: product.id,
                slug: product.slug,
                categorySlug: category.slug,
                name: product.name,
                nameRu: product.name_ru,
                imageUrl: product.image_url,
                imageUrlRu: product.image_url_ru,
                currency: product.currency,
                productType: product.product_type,
                deliveryType: product.delivery_type,
                allowsFixedValues: product.allows_fixed_values,
                allowsCustomValue: product.allows_custom_value,
                minimumCustomValue:
                  product.minimum_custom_value === null
                    ? null
                    : Number(product.minimum_custom_value),
                maximumCustomValue:
                  product.maximum_custom_value === null
                    ? null
                    : Number(product.maximum_custom_value),
                allowsPlayerIdTopup:
                  product.allows_player_id_topup,
                allowsGamingVoucher:
                  product.allows_gaming_voucher,
                playerIdLabel:
                  product.player_id_label,
                customerDiscountPercent,
                affiliateCommissionPercent,
                affiliateMaximumCommissionPercent,
                isBulkOrder: product.is_bulk_order,
                bulkDeliveryInstructions: product.bulk_delivery_instructions,
                minimumQuantity: product.minimum_quantity,
                maximumQuantity: product.maximum_quantity,
                isUnlimitedStock: isUnlimitedStock(product.stock_quantity),
              }}
              customerFields={customerFields.map((field) => ({
                id: field.id,
                label: field.label,
                placeholder: field.placeholder,
                fieldType: field.field_type,
                isRequired: field.is_required,
              }))}
              options={options.map((option) => ({
                id: option.id,
                optionName: option.option_name,
                platform: option.platform,
                denomination:
                  option.denomination === null
                    ? null
                    : Number(option.denomination),
                sellingPrice: Number(option.selling_price),
                stockQuantity: option.stock_quantity,
                isCustomValue: option.is_custom_value,
                minimumQuantity: option.minimum_quantity,
                maximumQuantity: option.maximum_quantity,
                isInStock: option.is_in_stock !== false,
              }))}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
