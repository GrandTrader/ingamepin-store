"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { uploadStoreImage } from "@/lib/store-image-upload";
import { createClient } from "@/lib/supabase/server";

const allowedProductTypes = [
  "GAME_TOPUP",
  "GIFT_CARD",
  "SUBSCRIPTION",
  "GAME_KEY",
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

function productRedirect(
  id: string,
  kind: "success" | "error",
  message: string,
): never {
  redirect(
    `/admin/products/${id}/edit?${kind}=${encodeURIComponent(
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

async function getAdminClient() {
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
    redirect("/admin/login?error=Access denied");
  }

  return supabase;
}

export async function updateProduct(
  formData: FormData,
) {
  const supabase = await getAdminClient();
  const admin = createAdminClient();

  const id = String(
    formData.get("id") ?? "",
  ).trim();

  if (!id) {
    throw new Error("Product ID is required.");
  }

  const categoryId = String(
    formData.get("category_id") ?? "",
  ).trim();

  const name = String(
    formData.get("name") ?? "",
  ).trim();

  const nameRu = String(formData.get("name_ru") ?? "").trim();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  const descriptionRu = String(
    formData.get("description_ru") ?? "",
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
    formData.get("delivery_instructions") ?? "",
  ).trim();

  const badge = String(
    formData.get("badge") ?? "",
  ).trim();

  const badgeRu = String(formData.get("badge_ru") ?? "").trim();

  const price = Number(
    formData.get("price"),
  );

  const stockQuantity = Number(
    formData.get("stock_quantity"),
  );

  const status = String(
    formData.get("status") ?? "",
  );

  const isFeatured =
    formData.get("is_featured") === "on";

  const requiresCustomerDetails =
    formData.get(
      "requires_customer_details",
    ) === "on";

  if (!categoryId) {
    productRedirect(
      id,
      "error",
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
    productRedirect(
      id,
      "error",
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
    productRedirect(
      id,
      "error",
      "The selected category configuration is invalid.",
    );
  }

  if (
    name.length < 2 ||
    name.length > 150
  ) {
    productRedirect(
      id,
      "error",
      "Product name must contain between 2 and 150 characters.",
    );
  }

  if (description.length > 5000) {
    productRedirect(
      id,
      "error",
      "Product description cannot exceed 5000 characters.",
    );
  }

  if (nameRu && (nameRu.length < 2 || nameRu.length > 150)) {
    productRedirect(
      id,
      "error",
      "Russian product name must contain between 2 and 150 characters.",
    );
  }

  if (descriptionRu.length > 5000) {
    productRedirect(
      id,
      "error",
      "Russian product description cannot exceed 5000 characters.",
    );
  }

  if (!isValidWebUrl(imageUrl)) {
    productRedirect(
      id,
      "error",
      "Enter a valid HTTP or HTTPS image URL.",
    );
  }

  if (
    region.length < 2 ||
    region.length > 100
  ) {
    productRedirect(
      id,
      "error",
      "Please select a valid product region.",
    );
  }

  if (
    !allowedDeliveryTypes.includes(
      deliveryType as DeliveryType,
    )
  ) {
    productRedirect(
      id,
      "error",
      "The selected delivery type is invalid.",
    );
  }

  if (deliveryInstructions.length > 2000) {
    productRedirect(
      id,
      "error",
      "Delivery instructions cannot exceed 2000 characters.",
    );
  }

  if (badge.length > 100) {
    productRedirect(
      id,
      "error",
      "Product badge cannot exceed 100 characters.",
    );
  }

  if (badgeRu.length > 100) {
    productRedirect(
      id,
      "error",
      "Russian product badge cannot exceed 100 characters.",
    );
  }

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    productRedirect(
      id,
      "error",
      "The product price is invalid.",
    );
  }

  if (
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0
  ) {
    productRedirect(
      id,
      "error",
      "The stock quantity is invalid.",
    );
  }

  if (
    !allowedStatuses.includes(
      status as ProductStatus,
    )
  ) {
    productRedirect(
      id,
      "error",
      "The selected product status is invalid.",
    );
  }

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

  let minimumCustomValue:
    | number
    | null = null;

  let maximumCustomValue:
    | number
    | null = null;

  if (
    isGiftCard &&
    !allowsFixedValues &&
    !allowsCustomValue
  ) {
    productRedirect(
      id,
      "error",
      "Enable fixed values, custom value, or both.",
    );
  }

  if (allowsCustomValue) {
    minimumCustomValue = Number(
      formData.get("minimum_custom_value"),
    );

    maximumCustomValue = Number(
      formData.get("maximum_custom_value"),
    );

    if (
      !Number.isFinite(minimumCustomValue) ||
      minimumCustomValue <= 0
    ) {
      productRedirect(
        id,
        "error",
        "Enter a valid minimum custom value.",
      );
    }

    if (
      !Number.isFinite(maximumCustomValue) ||
      maximumCustomValue < minimumCustomValue
    ) {
      productRedirect(
        id,
        "error",
        "Maximum custom value must be greater than or equal to the minimum value.",
      );
    }
  }

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

  if (
    isGamingTopup &&
    !allowsPlayerIdTopup &&
    !allowsGamingVoucher
  ) {
    productRedirect(
      id,
      "error",
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
    productRedirect(
      id,
      "error",
      "Player ID field label must contain between 2 and 100 characters.",
    );
  }


  const optionIds = formData
    .getAll("option_id")
    .map((value) => String(value).trim());

  const optionTypes = formData
    .getAll("option_type")
    .map((value) => String(value).trim());

  const optionNames = formData
    .getAll("option_name")
    .map((value) => String(value).trim());

  const optionPlatforms = formData
    .getAll("option_platform")
    .map((value) => String(value).trim());

  const optionDenominations = formData
    .getAll("option_denomination")
    .map((value) => String(value).trim());

  const optionCurrencies = formData
    .getAll("option_denomination_currency")
    .map((value) =>
      String(value).trim().toUpperCase(),
    );

  const optionPrices = formData
    .getAll("option_selling_price")
    .map((value) => String(value).trim());

  const optionStocks = formData
    .getAll("option_stock_quantity")
    .map((value) => String(value).trim());

  const optionSortOrders = formData
    .getAll("option_sort_order")
    .map((value) => String(value).trim());

  const optionActiveValues = formData
    .getAll("option_is_active")
    .map((value) => String(value).trim());

  const optionCount = optionNames.length;
  const optionArrayLengths = [
    optionIds.length,
    optionTypes.length,
    optionPlatforms.length,
    optionDenominations.length,
    optionCurrencies.length,
    optionPrices.length,
    optionStocks.length,
    optionSortOrders.length,
    optionActiveValues.length,
  ];

  if (
    optionCount > 50 ||
    optionArrayLengths.some(
      (length) => length !== optionCount,
    )
  ) {
    productRedirect(
      id,
      "error",
      "The product option information is incomplete.",
    );
  }

  const options = optionNames.map(
    (optionName, index) => {
      const optionId = optionIds[index];
      const optionType = optionTypes[index];
      const platform = optionPlatforms[index];
      const denominationValue =
        optionDenominations[index];
      const denominationCurrency =
        optionCurrencies[index];
      const sellingPrice = Number(
        optionPrices[index],
      );
      const optionStockQuantity = Number(
        optionStocks[index],
      );
      const optionSortOrder = Number(
        optionSortOrders[index],
      );
      const isActive =
        optionActiveValues[index] === "true";

      if (
        optionId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          optionId,
        )
      ) {
        productRedirect(
          id,
          "error",
          `Option ${index + 1} has an invalid ID.`,
        );
      }

      if (
        !allowedOptionTypes.includes(
          optionType as OptionType,
        )
      ) {
        productRedirect(
          id,
          "error",
          `Select a valid type for option ${index + 1}.`,
        );
      }

      if (
        optionName.length < 1 ||
        optionName.length > 100
      ) {
        productRedirect(
          id,
          "error",
          `Option ${index + 1} must have a name.`,
        );
      }

      if (platform.length > 50) {
        productRedirect(
          id,
          "error",
          `Platform for option ${index + 1} cannot exceed 50 characters.`,
        );
      }

      let denomination: number | null = null;
      let savedCurrency: string | null = null;

      if (optionType === "CURRENCY") {
        denomination = Number(
          denominationValue,
        );

        if (
          !Number.isInteger(denomination) ||
          denomination <= 0
        ) {
          productRedirect(
            id,
            "error",
            `Enter a valid denomination for option ${index + 1}.`,
          );
        }

        if (
          !/^[A-Z]{3}$/.test(
            denominationCurrency,
          )
        ) {
          productRedirect(
            id,
            "error",
            `Select a valid currency for option ${index + 1}.`,
          );
        }

        savedCurrency =
          denominationCurrency;
      }

      if (
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
      ) {
        productRedirect(
          id,
          "error",
          `Enter a valid selling price for option ${index + 1}.`,
        );
      }

      if (
        !Number.isInteger(
          optionStockQuantity,
        ) ||
        optionStockQuantity < 0
      ) {
        productRedirect(
          id,
          "error",
          `Enter valid stock for option ${index + 1}.`,
        );
      }

      if (
        !Number.isInteger(optionSortOrder) ||
        optionSortOrder < 0
      ) {
        productRedirect(
          id,
          "error",
          `Enter a valid sort order for option ${index + 1}.`,
        );
      }

      return {
        id: optionId,
        option_type:
          optionType as OptionType,
        option_name: optionName,
        platform: platform || null,
        denomination,
        denomination_currency:
          savedCurrency,
        selling_price: sellingPrice,
        stock_quantity:
          optionStockQuantity,
        sort_order: optionSortOrder,
        is_active: isActive,
      };
    },
  );

  const normalizedNames = options.map(
    (option) =>
      option.option_name.toLowerCase(),
  );

  if (
    new Set(normalizedNames).size !==
    normalizedNames.length
  ) {
    productRedirect(
      id,
      "error",
      "The same product option cannot be added twice.",
    );
  }

  const submittedExistingIds = options
    .filter((option) => option.id)
    .map((option) => option.id);

  if (
    new Set(submittedExistingIds).size !==
    submittedExistingIds.length
  ) {
    productRedirect(
      id,
      "error",
      "A saved option was submitted more than once.",
    );
  }

  const activeFixedOptionCount =
    options.filter(
      (option) => option.is_active,
    ).length;

  const fixedOptionsRequired =
    !isGiftCard || allowsFixedValues;

  if (
    fixedOptionsRequired &&
    activeFixedOptionCount === 0
  ) {
    productRedirect(
      id,
      "error",
      "Keep at least one active product option.",
    );
  }

  if (submittedExistingIds.length > 0) {
    const existingOptionResult =
      await admin
        .from("product_options")
        .select("id")
        .eq("product_id", id)
        .eq("is_custom_value", false)
        .in("id", submittedExistingIds);

    if (existingOptionResult.error) {
      productRedirect(
        id,
        "error",
        `Unable to verify product options: ${existingOptionResult.error.message}`,
      );
    }

    const verifiedIds = new Set(
      (existingOptionResult.data ?? []).map(
        (option) => option.id,
      ),
    );

    if (
      submittedExistingIds.some(
        (optionId) =>
          !verifiedIds.has(optionId),
      )
    ) {
      productRedirect(
        id,
        "error",
        "One or more options do not belong to this product.",
      );
    }
  }

  try {
    imageUrl =
      (await uploadStoreImage(
        formData.get("image_file"),
        "products",
      )) ?? imageUrl;
  } catch (error) {
    productRedirect(
      id,
      "error",
      error instanceof Error
        ? error.message
        : "Unable to upload product image.",
    );
  }

  const updateResult = await admin
    .from("products")
    .update({
      category_id: categoryId,
      product_type: productType,
      name,
      name_ru: nameRu || null,
      description: description || null,
      description_ru: descriptionRu || null,
      image_url: imageUrl || null,
      region,
      delivery_type: deliveryType,
      delivery_instructions:
        deliveryInstructions || null,
      requires_customer_details:
        requiresCustomerDetails ||
        allowsPlayerIdTopup,
      allows_fixed_values:
        allowsFixedValues,
      allows_custom_value:
        allowsCustomValue,
      minimum_custom_value:
        minimumCustomValue,
      maximum_custom_value:
        maximumCustomValue,
      allows_player_id_topup:
        allowsPlayerIdTopup,
      allows_gaming_voucher:
        allowsGamingVoucher,
      player_id_label:
        allowsPlayerIdTopup
          ? playerIdLabel
          : null,
      badge: badge || null,
      badge_ru: badgeRu || null,
      price,
      stock_quantity: stockQuantity,
      status,
      is_featured: isFeatured,
    })
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();

  if (updateResult.error) {
    productRedirect(
      id,
      "error",
      `Unable to update product: ${updateResult.error.message}`,
    );
  }

  if (!updateResult.data) {
    productRedirect(
      id,
      "error",
      "The product was not found or could not be updated.",
    );
  }

  const existingOptions = options.filter(
    (option) => option.id,
  );

  for (const option of existingOptions) {
    const optionUpdateResult =
      await admin
        .from("product_options")
        .update({
          category_id: categoryId,
          option_type:
            option.option_type,
          option_name:
            option.option_name,
          platform:
            option.platform,
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
          is_active:
            option.is_active,
        })
        .eq("id", option.id)
        .eq("product_id", id)
        .eq("is_custom_value", false);

    if (optionUpdateResult.error) {
      productRedirect(
        id,
        "error",
        `Product saved, but option "${option.option_name}" could not be updated: ${optionUpdateResult.error.message}`,
      );
    }
  }

  const newOptions = options
    .filter((option) => !option.id)
    .map((option) => ({
      product_id: id,
      category_id: categoryId,
      option_type:
        option.option_type,
      option_name:
        option.option_name,
      platform:
        option.platform,
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
      is_active:
        option.is_active,
      is_custom_value: false,
    }));

  if (newOptions.length > 0) {
    const optionInsertResult =
      await admin
        .from("product_options")
        .insert(newOptions);

    if (optionInsertResult.error) {
      productRedirect(
        id,
        "error",
        `Product saved, but new options could not be added: ${optionInsertResult.error.message}`,
      );
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/gift-codes");
  revalidatePath(
    `/admin/products/${id}/edit`,
  );
  revalidatePath(
    `/product/${updateResult.data.slug}`,
  );

  productRedirect(
    id,
    "success",
    "Product saved successfully",
  );
}

export async function deleteProduct(
  formData: FormData,
) {
  await getAdminClient();

  const id = String(
    formData.get("id") ?? "",
  ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    redirect(
      "/admin/products?error=Product%20ID%20is%20invalid",
    );
  }

  const admin = createAdminClient();

  const productResult = await admin
    .from("products")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (productResult.error) {
    productRedirect(
      id,
      "error",
      `Unable to verify product: ${productResult.error.message}`,
    );
  }

  if (!productResult.data) {
    redirect(
      "/admin/products?error=Product%20was%20not%20found",
    );
  }

  const orderItemsResult = await admin
    .from("order_items")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("product_id", id);

  if (orderItemsResult.error) {
    productRedirect(
      id,
      "error",
      `Unable to check order history: ${orderItemsResult.error.message}`,
    );
  }

  if ((orderItemsResult.count ?? 0) > 0) {
    productRedirect(
      id,
      "error",
      "This product has order history and cannot be deleted. Set its status to Inactive instead.",
    );
  }

  const codesResult = await admin
    .from("gift_card_codes")
    .delete()
    .eq("product_id", id);

  if (codesResult.error) {
    productRedirect(
      id,
      "error",
      `Unable to remove product codes: ${codesResult.error.message}`,
    );
  }

  const optionsResult = await admin
    .from("product_options")
    .delete()
    .eq("product_id", id);

  if (optionsResult.error) {
    productRedirect(
      id,
      "error",
      `Unable to remove product options: ${optionsResult.error.message}`,
    );
  }

  const deleteResult = await admin
    .from("products")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (deleteResult.error) {
    productRedirect(
      id,
      "error",
      `Unable to delete product: ${deleteResult.error.message}`,
    );
  }

  if (!deleteResult.data) {
    productRedirect(
      id,
      "error",
      "The product could not be deleted.",
    );
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/gift-codes");

  redirect(
    `/admin/products?success=${encodeURIComponent(
      `Product "${productResult.data.name}" deleted successfully`,
    )}`,
  );
}

export async function deleteProductOption(
  productId: string,
  optionId: string,
) {
  await getAdminClient();

  productId = String(productId ?? "").trim();
  optionId = String(optionId ?? "").trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(productId) || !uuidPattern.test(optionId)) {
    redirect("/admin/products?error=Product%20option%20information%20is%20invalid");
  }

  const admin = createAdminClient();
  const optionResult = await admin
    .from("product_options")
    .select("id, option_name, is_custom_value")
    .eq("id", optionId)
    .eq("product_id", productId)
    .maybeSingle();

  if (optionResult.error || !optionResult.data) {
    productRedirect(productId, "error", optionResult.error ? `Unable to verify option: ${optionResult.error.message}` : "The product option was not found.");
  }

  if (optionResult.data.is_custom_value) {
    productRedirect(productId, "error", "The automatic custom-value option cannot be deleted manually.");
  }

  const [productResult, remainingResult] = await Promise.all([
    admin.from("products").select("allows_custom_value").eq("id", productId).maybeSingle(),
    admin.from("product_options").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("is_custom_value", false).eq("is_active", true).neq("id", optionId),
  ]);

  if (productResult.error || !productResult.data || remainingResult.error) {
    productRedirect(productId, "error", "Unable to verify the remaining product options.");
  }

  if ((remainingResult.count ?? 0) === 0 && !productResult.data.allows_custom_value) {
    productRedirect(productId, "error", "Add another active option before deleting the final product option.");
  }

  const unusedCodesResult = await admin
    .from("gift_card_codes")
    .delete()
    .eq("product_option_id", optionId)
    .is("order_item_id", null);

  if (unusedCodesResult.error) {
    productRedirect(productId, "error", `Unable to remove unused option codes: ${unusedCodesResult.error.message}`);
  }

  const historicalCodesResult = await admin
    .from("gift_card_codes")
    .update({ product_option_id: null })
    .eq("product_option_id", optionId);

  if (historicalCodesResult.error) {
    productRedirect(productId, "error", `Unable to preserve delivered codes: ${historicalCodesResult.error.message}`);
  }

  const orderItemsResult = await admin
    .from("order_items")
    .update({ product_option_id: null })
    .eq("product_option_id", optionId);

  if (orderItemsResult.error) {
    productRedirect(productId, "error", `Unable to preserve order history: ${orderItemsResult.error.message}`);
  }

  const deleteResult = await admin
    .from("product_options")
    .delete()
    .eq("id", optionId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();

  if (deleteResult.error || !deleteResult.data) {
    productRedirect(productId, "error", deleteResult.error ? `Unable to delete option: ${deleteResult.error.message}` : "The product option could not be deleted.");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/gift-codes");
  revalidatePath(`/admin/products/${productId}/edit`);

  productRedirect(productId, "success", `Option "${optionResult.data.option_name}" deleted permanently`);
}


