import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import ProductPurchaseForm from "./ProductPurchaseForm";
import { getSignedInCustomerDiscounts } from "@/lib/customer-discounts";
import LocalizedProductText from "@/components/LocalizedProductText";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{
    slug: string;
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
  categories: CategoryRelation;
};

type ProductOptionRow = {
  id: string;
  option_name: string;
  platform: string | null;
  denomination: number | string | null;
  selling_price: number | string;
  stock_quantity: number;
  is_custom_value: boolean;
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
}: ProductPageProps) {
  const { slug } = await params;
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

  const options = (optionResult.data ?? []) as ProductOptionRow[];
  const category = getCategory(product.categories);
  const customerDiscounts = await getSignedInCustomerDiscounts();
  const customerDiscountPercent = customerDiscounts.get(product.id) ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 sm:py-10">
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
            <div className="order-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 sm:rounded-3xl lg:col-start-1 lg:row-start-1">
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

          <aside className="order-2 h-fit rounded-2xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl sm:p-8 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
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
              }}
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
              }))}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}


