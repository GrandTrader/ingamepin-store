import Link from "next/link";
import { notFound } from "next/navigation";

import ProductPurchaseForm from "@/app/product/[slug]/ProductPurchaseForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SettingsRow = {
  product_id: string | null;
  launch_date: string | null;
  bonus_text: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  currency: string;
  delivery_type: string;
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

export default async function PreorderPage() {
  const supabase = await createClient();
  const settingsResult = await supabase
    .from("preorder_popup_settings")
    .select(
      "product_id, launch_date, bonus_text",
    )
    .eq("id", true)
    .eq("is_enabled", true)
    .maybeSingle();

  if (settingsResult.error) {
    throw new Error(
      `Unable to load preorder: ${settingsResult.error.message}`,
    );
  }

  const settings =
    settingsResult.data as SettingsRow | null;

  if (!settings?.product_id) {
    notFound();
  }

  const [productResult, optionResult] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, slug, description, image_url, currency, delivery_type",
        )
        .eq("id", settings.product_id)
        .eq("status", "ACTIVE")
        .eq("is_preorder_only", true)
        .maybeSingle(),
      supabase
        .from("product_options")
        .select(
          "id, option_name, platform, denomination, selling_price, stock_quantity, is_custom_value",
        )
        .eq("product_id", settings.product_id)
        .eq("is_active", true)
        .order("sort_order", {
          ascending: true,
        }),
    ]);

  if (productResult.error) {
    throw new Error(
      `Unable to load preorder product: ${productResult.error.message}`,
    );
  }

  if (optionResult.error) {
    throw new Error(
      `Unable to load preorder editions: ${optionResult.error.message}`,
    );
  }

  if (!productResult.data) {
    notFound();
  }

  const product =
    productResult.data as ProductRow;
  const options =
    (optionResult.data ?? []) as ProductOptionRow[];

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-white sm:px-5 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <nav className="text-sm text-slate-400">
          <Link
            href="/"
            className="transition hover:text-cyan-400"
          >
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-white">
            Game Preorder
          </span>
        </nav>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] lg:gap-8">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                className="aspect-[16/10] w-full object-fill"
              />
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-500 text-7xl font-black">
                {product.name
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}

            <div className="p-5 sm:p-8">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-400">
                Independent Game Preorder
              </p>
              <h1 className="mt-3 text-3xl font-black sm:text-4xl">
                {product.name}
              </h1>

              {settings.launch_date && (
                <p className="mt-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
                  Launch:{" "}
                  {new Date(
                    settings.launch_date,
                  ).toLocaleString("en-IN", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone:
                      "Asia/Kolkata",
                  })}
                </p>
              )}

              <div className="mt-6 whitespace-pre-line text-sm leading-7 text-slate-300 sm:text-base">
                {product.description}
              </div>

              {settings.bonus_text && (
                <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 font-bold text-cyan-300">
                  🎁 {settings.bonus_text}
                </div>
              )}
            </div>
          </section>

          <aside className="h-fit rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8 lg:sticky lg:top-6">
            <p className="text-sm font-bold text-cyan-400">
              Secure preorder checkout
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Choose your edition
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Standard Edition is selected by
              default.
            </p>

            <ProductPurchaseForm
              product={{
                id: product.id,
                slug: product.slug,
                categorySlug: "preorder",
                name: product.name,
                imageUrl: product.image_url,
                currency: product.currency,
                productType: "GAME_KEY",
                deliveryType:
                  product.delivery_type,
                allowsFixedValues: true,
                allowsCustomValue: false,
                minimumCustomValue: null,
                maximumCustomValue: null,
                allowsPlayerIdTopup: false,
                allowsGamingVoucher: true,
                playerIdLabel: null,
                customerDiscountPercent: 0,
              }}
              options={options.map((option) => ({
                id: option.id,
                optionName: option.option_name,
                platform: option.platform,
                denomination:
                  option.denomination === null
                    ? null
                    : Number(
                        option.denomination,
                      ),
                sellingPrice: Number(
                  option.selling_price,
                ),
                stockQuantity:
                  option.stock_quantity,
                isCustomValue:
                  option.is_custom_value,
              }))}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
