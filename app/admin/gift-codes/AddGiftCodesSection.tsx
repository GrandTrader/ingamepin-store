import { createClient } from "@/lib/supabase/server";

import AddGiftCodesForm from "./AddGiftCodesForm";

type ProductRow = {
  id: string;
  name: string;
};

type ProductOptionRow = {
  id: string;
  product_id: string;
  option_name: string;
  denomination: number | null;
};

export default async function AddGiftCodesSection() {
  const supabase = await createClient();

  const [productResult, optionResult] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("status", "ACTIVE")
        .order("name", {
          ascending: true,
        }),

      supabase
        .from("product_options")
        .select(
          "id, product_id, option_name, denomination",
        )
        .eq("is_active", true)
        .order("sort_order", {
          ascending: true,
        }),
    ]);

  if (productResult.error) {
    throw new Error(
      `Unable to load products: ${productResult.error.message}`,
    );
  }

  if (optionResult.error) {
    throw new Error(
      `Unable to load product options: ${optionResult.error.message}`,
    );
  }

  const products =
    (productResult.data ?? []) as ProductRow[];

  const options =
    (optionResult.data ?? []) as ProductOptionRow[];

  const productsWithOptions = products.map(
    (product) => ({
      id: product.id,
      name: product.name,

      options: options
        .filter(
          (option) =>
            option.product_id === product.id,
        )
        .map((option) => ({
          id: option.id,
          name: option.option_name,
          denomination: option.denomination,
        })),
    }),
  );

  return (
    <AddGiftCodesForm
      products={productsWithOptions}
    />
  );
}
