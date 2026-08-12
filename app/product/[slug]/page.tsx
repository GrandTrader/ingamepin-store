import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductPurchaseForm from "./ProductPurchaseForm";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import LocalizedProductText from "@/components/LocalizedProductText";
import ProductViewTracker from "@/components/ProductViewTracker";
import AffiliateReferralTracker from "@/components/AffiliateReferralTracker";
import { isUnlimitedStock } from "@/lib/product-stock";

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
    }
  | {
      name: string;
      slug: string;
    }[]
  | null;

type ProductRow = {
  id: string;
  name: string;
  name_ru: string | null;
  slug: string;
  description: string | null;
  description_ru: string | null;
  image_url: string | null;
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
};

function getCategory(category: CategoryRelation) {
  const value = Array.isArray(category) ? category[0] : category;

  return {
    name: value?.name ?? "Digital Products",
    slug: value?.slug ?? "all-products",
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { slug } = await params;
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
        name,
        name_ru,
        slug,
        description,
        description_ru,
        image_url,
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
          slug
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
        maximum_quantity
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
  const customerDiscounts = await getSignedInCustomerDiscounts();
  const customerDiscountPercent = customerDiscounts.get(product.id) ?? 0;
  let affiliateCommissionPercent = 0;

  if (affiliateCode && product.affiliate_enabled) {
    const admin = createAdminClient();
    const [settingsResult, affiliateResult] = await Promise.all([
      admin
        .from("affiliate_settings")
        .select("program_enabled")
        .eq("id", 1)
        .maybeSingle(),
      admin
        .from("affiliate_accounts")
        .select("id, commission_override_percent")
        .eq("affiliate_code", affiliateCode.toUpperCase())
        .eq("status", "APPROVED")
        .maybeSingle(),
    ]);

    const affiliate = affiliateResult.data;

    if (settingsResult.data?.program_enabled && affiliate) {
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
            <div className="relative order-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 sm:rounded-3xl lg:col-start-1 lg:row-start-1">
              {product.is_bulk_order && (
                <span className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-2xl sm:bottom-6 sm:left-6 sm:text-sm">
                  <span aria-hidden="true">◆</span>
                  <LocalizedProductText
                    english="Bulk Order"
                    russian="Оптовый заказ"
                  />
                </span>
              )}

              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="aspect-[16/10] w-full object-fill"
                />
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-500 text-7xl font-black">
                  {product.name.charAt(0).toUpperCase()}
                </div>
              )}
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
                    english={product.badge ?? "Digital Product"}
                    russian={product.badge_ru}
                  />
                </span>
              </div>

              {product.is_bulk_order && (
                  <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 sm:mt-7 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300 font-black text-slate-950"
                      >
                        ◆
                      </span>
                      <span>
                        <span className="block text-sm font-black text-amber-200 sm:text-base">
                          <LocalizedProductText
                            english="Bulk delivery information"
                            russian="Информация об оптовой доставке"
                          />
                        </span>
                        <span className="mt-1 block whitespace-pre-line text-sm leading-6 text-slate-300">
                          {product.bulk_delivery_instructions || "Bulk Delivery Time: 1-15 Working Days"}
                        </span>
                      </span>
                    </div>
                  </div>
                )}

              <div className="mt-5 whitespace-pre-line text-sm leading-6 text-slate-300 sm:mt-7 sm:text-base sm:leading-7">
                <LocalizedProductText
                  english={
                    product.description ??
                    "Product details and delivery information will be provided with your order."
                  }
                  russian={product.description_ru}
                />
              </div>

              {product.delivery_instructions && (
                <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 sm:mt-7 sm:p-5">
                  <h2 className="font-black text-cyan-300">
                    <LocalizedProductText
                      english="Delivery instructions"
                      russian="Инструкции по доставке"
                    />
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">
                    {product.delivery_instructions}
                  </p>
                </div>
              )}
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
              }))}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
