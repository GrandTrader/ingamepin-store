"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { uploadStoreImage } from "@/lib/store-image-upload";

const allowedProductTypes = [
  "GAME_TOPUP",
  "GAME_KEY",
  "GIFT_CARD",
  "SUBSCRIPTION",
  "DIGITAL_PRODUCT",
] as const;

const allowedDeliveryTypes = [
  "AUTOMATIC",
  "MANUAL",
] as const;

const allowedStatuses = [
  "ACTIVE",
  "INACTIVE",
  "DRAFT",
] as const;

const allowedOptionTypes = [
  "CURRENCY",
  "IN_PLATFORM",
  "OTHER",
] as const;

type ProductType =
  (typeof allowedProductTypes)[number];

type DeliveryType =
  (typeof allowedDeliveryTypes)[number];

type ProductStatus =
  (typeof allowedStatuses)[number];

type OptionType =
  (typeof allowedOptionTypes)[number];

function redirectWithError(
  message: string,
): never {
  redirect(
    `/admin/products/new?error=${encodeURIComponent(
      message,
    )}`,
  );
}

function isValidWebUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

export async function createProduct(
  formData: FormData,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect(
      "/admin/login?error=Access denied",
    );
  }

  const categoryId = String(
    formData.get("category_id") ?? "",
  ).trim();

  if (!categoryId) {
    redirectWithError(
      "Please select a category.",
    );
  }

  const categoryResult = await supabase
    .from("categories")
    .select("id, category_type")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();

  if (
    categoryResult.error ||
    !categoryResult.data
  ) {
    redirectWithError(
      "The selected category does not exist.",
    );
  }

  const productType = String(
    categoryResult.data.category_type,
  );

  if (
    !allowedProductTypes.includes(
      productType as ProductType,
    )
  ) {
    redirectWithError(
      "The selected category configuration is invalid.",
    );
  }

  const name = String(
    formData.get("name") ?? "",
  ).trim();

  const slug = String(
    formData.get("slug") ?? "",
  )
    .trim()
    .toLowerCase();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  let imageUrl = String(
    formData.get("image_url") ?? "",
  ).trim();

  const region = String(
    formData.get("region") ?? "",
  ).trim();

  const deliveryType = String(
    formData.get("delivery_type") ?? "MANUAL",
  ) === "AUTOMATIC"
    ? "AUTOMATIC"
    : "MANUAL";

  const deliveryInstructions = String(
    formData.get(
      "delivery_instructions",
    ) ?? "",
  ).trim();

  const badge = String(
    formData.get("badge") ?? "",
  ).trim();

  const currency = String(
    formData.get("currency") ?? "USD",
  )
    .trim()
    .toUpperCase();

  const status = String(
    formData.get("status") ?? "DRAFT",
  );

  const price = Number(
    formData.get("price"),
  );

  const stockQuantity = Number(
    formData.get("stock_quantity"),
  );

  const sortOrder = Number(
    formData.get("sort_order"),
  );

  const isFeatured =
    formData.get("is_featured") === "on";

  const initialSoldCount =
    Math.floor(Math.random() * 701) + 300;

  const requiresCustomerDetails =
    formData.get(
      "requires_customer_details",
    ) === "on";

  const isGamingTopup =
    productType === "GAME_TOPUP";

  const allowsPlayerIdTopup =
    isGamingTopup &&
    formData.get(
      "allows_player_id_topup",
    ) === "on";

  const allowsGamingVoucher =
    isGamingTopup &&
    formData.get(
      "allows_gaming_voucher",
    ) === "on";

  const playerIdLabel = String(
    formData.get("player_id_label") ?? "",
  ).trim();

  const isGiftCard =
    productType === "GIFT_CARD";

  const allowsFixedValues = isGiftCard
    ? formData.get(
        "allows_fixed_values",
      ) === "on"
    : true;

  const allowsCustomValue = isGiftCard
    ? formData.get(
        "allows_custom_value",
      ) === "on"
    : false;

  const minimumCustomValueRaw =
    String(
      formData.get(
        "minimum_custom_value",
      ) ?? "",
    ).trim();

  const maximumCustomValueRaw =
    String(
      formData.get(
        "maximum_custom_value",
      ) ?? "",
    ).trim();

  let minimumCustomValue:
    | number
    | null = null;

  let maximumCustomValue:
    | number
    | null = null;

  const optionTypeValues = formData
    .getAll("option_type")
    .map((value) =>
      String(value).trim(),
    );

  const optionNameValues = formData
    .getAll("option_name")
    .map((value) =>
      String(value).trim(),
    );

  const denominationValues = formData
    .getAll("option_denomination")
    .map((value) =>
      String(value).trim(),
    );

  const denominationCurrencyValues =
    formData
      .getAll(
        "option_denomination_currency",
      )
      .map((value) =>
        String(value)
          .trim()
          .toUpperCase(),
      );

  const sellingPriceValues = formData
    .getAll("option_selling_price")
    .map((value) =>
      String(value).trim(),
    );

  const optionStockValues = formData
    .getAll("option_stock_quantity")
    .map((value) =>
      String(value).trim(),
    );

  const optionSortValues = formData
    .getAll("option_sort_order")
    .map((value) =>
      String(value).trim(),
    );

  if (
    name.length < 2 ||
    name.length > 150
  ) {
    redirectWithError(
      "Product name must contain between 2 and 150 characters.",
    );
  }

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      slug,
    )
  ) {
    redirectWithError(
      "The product slug is invalid.",
    );
  }

  if (description.length > 5000) {
    redirectWithError(
      "Description is too long.",
    );
  }

  if (!isValidWebUrl(imageUrl)) {
    redirectWithError(
      "Enter a valid HTTP or HTTPS image URL.",
    );
  }

  if (
    region.length < 2 ||
    region.length > 100
  ) {
    redirectWithError(
      "Please select a valid product region.",
    );
  }

  if (
    !allowedDeliveryTypes.includes(
      deliveryType as DeliveryType,
    )
  ) {
    redirectWithError(
      "The selected delivery type is invalid.",
    );
  }

  if (
    !allowedStatuses.includes(
      status as ProductStatus,
    )
  ) {
    redirectWithError(
      "The selected product status is invalid.",
    );
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    redirectWithError(
      "Currency must be a valid three-letter code.",
    );
  }

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    redirectWithError(
      "Enter a valid base price.",
    );
  }

  if (
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0
  ) {
    redirectWithError(
      "Enter a valid stock quantity.",
    );
  }

  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < 0
  ) {
    redirectWithError(
      "Enter a valid sort order.",
    );
  }

  if (
    isGamingTopup &&
    !allowsPlayerIdTopup &&
    !allowsGamingVoucher
  ) {
    redirectWithError(
      "Enable Player ID top-up, Gaming voucher, or both.",
    );
  }

  if (
    allowsPlayerIdTopup &&
    (
      playerIdLabel.length < 2 ||
      playerIdLabel.length > 100
    )
  ) {
    redirectWithError(
      "Player ID field label must contain between 2 and 100 characters.",
    );
  }

  if (
    isGiftCard &&
    !allowsFixedValues &&
    !allowsCustomValue
  ) {
    redirectWithError(
      "Enable fixed values, custom value, or both for this Gift Card.",
    );
  }

  if (
    isGiftCard &&
    allowsCustomValue
  ) {
    minimumCustomValue = Number(
      minimumCustomValueRaw,
    );

    maximumCustomValue = Number(
      maximumCustomValueRaw,
    );

    if (
      !Number.isFinite(
        minimumCustomValue,
      ) ||
      minimumCustomValue <= 0
    ) {
      redirectWithError(
        "Enter a valid minimum custom value.",
      );
    }

    if (
      !Number.isFinite(
        maximumCustomValue,
      ) ||
      maximumCustomValue <
        minimumCustomValue
    ) {
      redirectWithError(
        "Maximum custom value must be greater than or equal to the minimum value.",
      );
    }
  }

  const optionCount =
    optionNameValues.length;

  if (
    optionCount === 0 ||
    optionCount > 50
  ) {
    redirectWithError(
      "Add between 1 and 50 product options.",
    );
  }

  const optionArrayLengths = [
    optionTypeValues.length,
    denominationValues.length,
    denominationCurrencyValues.length,
    sellingPriceValues.length,
    optionStockValues.length,
    optionSortValues.length,
  ];

  if (
    optionArrayLengths.some(
      (length) =>
        length !== optionCount,
    )
  ) {
    redirectWithError(
      "The product option information is incomplete.",
    );
  }

  const options = optionNameValues.map(
    (optionName, index) => {
      const optionType =
        optionTypeValues[index];

      const denominationValue =
        denominationValues[index];

      const denominationCurrency =
        denominationCurrencyValues[index];

      const sellingPriceValue =
        sellingPriceValues[index];

      const stockValue =
        optionStockValues[index];

      const optionSortValue =
        optionSortValues[index];

      if (
        !allowedOptionTypes.includes(
          optionType as OptionType,
        )
      ) {
        redirectWithError(
          `Select a valid option type in row ${
            index + 1
          }.`,
        );
      }

      if (
        optionName.length < 1 ||
        optionName.length > 100
      ) {
        redirectWithError(
          `Complete the option details in row ${
            index + 1
          }.`,
        );
      }

      if (
        !sellingPriceValue ||
        stockValue === undefined ||
        stockValue === "" ||
        optionSortValue === undefined ||
        optionSortValue === ""
      ) {
        redirectWithError(
          `Complete all required fields in option ${
            index + 1
          }.`,
        );
      }

      let denomination:
        | number
        | null = null;

      let savedDenominationCurrency:
        | string
        | null = null;

      if (optionType === "CURRENCY") {
        if (!denominationValue) {
          redirectWithError(
            `Enter a denomination in option ${
              index + 1
            }.`,
          );
        }

        const parsedDenomination =
          Number(denominationValue);

        if (
          !Number.isInteger(
            parsedDenomination,
          ) ||
          parsedDenomination <= 0
        ) {
          redirectWithError(
            `Enter a valid denomination in option ${
              index + 1
            }.`,
          );
        }

        if (
          !/^[A-Z]{3}$/.test(
            denominationCurrency,
          )
        ) {
          redirectWithError(
            `Select a valid denomination currency in option ${
              index + 1
            }.`,
          );
        }

        denomination =
          parsedDenomination;

        savedDenominationCurrency =
          denominationCurrency;
      }

      const sellingPrice = Number(
        sellingPriceValue,
      );

      const optionStockQuantity =
        Number(stockValue);

      const optionSortOrder = Number(
        optionSortValue,
      );

      if (
        !Number.isFinite(
          sellingPrice,
        ) ||
        sellingPrice < 0
      ) {
        redirectWithError(
          `Enter a valid selling price in option ${
            index + 1
          }.`,
        );
      }

      if (
        !Number.isInteger(
          optionStockQuantity,
        ) ||
        optionStockQuantity < 0
      ) {
        redirectWithError(
          `Enter valid stock in option ${
            index + 1
          }.`,
        );
      }

      if (
        !Number.isInteger(
          optionSortOrder,
        ) ||
        optionSortOrder < 0
      ) {
        redirectWithError(
          `Enter a valid sort order in option ${
            index + 1
          }.`,
        );
      }

      return {
        option_type:
          optionType as OptionType,

        option_name: optionName,

        denomination,

        denomination_currency:
          savedDenominationCurrency,

        selling_price:
          sellingPrice,

        stock_quantity:
          optionStockQuantity,

        sort_order:
          optionSortOrder,
      };
    },
  );

  const normalizedOptionNames =
    options.map((option) =>
      option.option_name.toLowerCase(),
    );

  if (
    new Set(normalizedOptionNames)
      .size !==
    normalizedOptionNames.length
  ) {
    redirectWithError(
      "The same product option cannot be added twice.",
    );
  }

  try {
    imageUrl =
      (await uploadStoreImage(
        formData.get("image_file"),
        "products",
      )) ?? imageUrl;
  } catch (error) {
    redirectWithError(
      error instanceof Error
        ? error.message
        : "Unable to upload product image.",
    );
  }

  const productResult = await supabase
    .from("products")
    .insert({
      category_id: categoryId,
      name,
      slug,
      description:
        description || null,
      image_url: imageUrl || null,
      region,
      product_type: productType,
      delivery_type: deliveryType,
      delivery_instructions:
        deliveryInstructions || null,
      requires_customer_details:
        requiresCustomerDetails,
      allows_player_id_topup:
        allowsPlayerIdTopup,
      allows_gaming_voucher:
        allowsGamingVoucher,
      player_id_label:
        allowsPlayerIdTopup
          ? playerIdLabel
          : null,
      allows_fixed_values:
        allowsFixedValues,
      allows_custom_value:
        allowsCustomValue,
      minimum_custom_value:
        minimumCustomValue,
      maximum_custom_value:
        maximumCustomValue,
      badge: badge || null,
      currency,
      price,
      stock_quantity:
        stockQuantity,
      status,
      is_featured: isFeatured,
      sort_order: sortOrder,
      sold_count: initialSoldCount,
    })
    .select("id")
    .single();

  if (
    productResult.error ||
    !productResult.data
  ) {
    if (
      productResult.error?.code ===
      "23505"
    ) {
      redirectWithError(
        "A product with this slug already exists.",
      );
    }

    redirectWithError(
      `Unable to create product: ${
        productResult.error
          ?.message ??
        "Unknown database error."
      }`,
    );
  }

  const productId =
    productResult.data.id;

  const optionRows = options.map(
    (option) => ({
      product_id: productId,
      category_id: categoryId,
      option_type:
        option.option_type,
      option_name:
        option.option_name,
      denomination:
        option.denomination,
      denomination_currency:
        option.denomination_currency,
      selling_price:
        option.selling_price,
      stock_quantity:
        option.stock_quantity,
      sort_order:
        option.sort_order,
      is_active: true,
    }),
  );

  const optionsResult = await supabase
    .from("product_options")
    .insert(optionRows);

  if (optionsResult.error) {
    await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    redirectWithError(
      `Unable to save product options: ${optionsResult.error.message}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath(
    "/admin/gift-codes",
  );
  revalidatePath(
    `/product/${slug}`,
  );

  redirect(
    "/admin/products?success=Product created successfully",
  );
}

