"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }
}

function settingsRedirect(
  kind: "error" | "success",
  message: string,
): never {
  redirect(
    `/admin/preorder-popup?${kind}=${encodeURIComponent(message)}`,
  );
}

function readPrice(
  formData: FormData,
  field: string,
  label: string,
) {
  const value = Number(
    String(formData.get(field) ?? "").trim(),
  );

  if (!Number.isFinite(value) || value < 0) {
    settingsRedirect(
      "error",
      `Enter a valid ${label} price.`,
    );
  }

  return value;
}

export async function savePreorderPopup(
  formData: FormData,
) {
  await requireAdministrator();

  const isEnabled =
    formData.get("is_enabled") === "on";
  const gameTitle = String(
    formData.get("game_title") ?? "",
  ).trim();
  const description = String(
    formData.get("description") ?? "",
  ).trim();
  const imageUrl = String(
    formData.get("image_url") ?? "",
  ).trim();
  const launchDate = String(
    formData.get("launch_date") ?? "",
  ).trim();
  const bonusText = String(
    formData.get("bonus_text") ?? "",
  ).trim();
  const buttonText =
    String(
      formData.get("button_text") ?? "",
    ).trim() || "PREORDER NOW";
  const standardPrice = readPrice(
    formData,
    "standard_price",
    "Standard Edition",
  );
  const ultimatePrice = readPrice(
    formData,
    "ultimate_price",
    "Ultimate Edition",
  );

  if (
    !gameTitle ||
    !description ||
    !imageUrl ||
    !launchDate
  ) {
    settingsRedirect(
      "error",
      "Enter the title, description, image, and launch date.",
    );
  }

  try {
    const image = new URL(imageUrl);
    if (!["http:", "https:"].includes(image.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    settingsRedirect(
      "error",
      "Enter a valid image URL.",
    );
  }

  const parsedLaunchDate = new Date(
    `${launchDate}:00+05:30`,
  );

  if (
    Number.isNaN(parsedLaunchDate.getTime())
  ) {
    settingsRedirect(
      "error",
      "Enter a valid launch date.",
    );
  }

  const admin = createAdminClient();
  const existingSettings = await admin
    .from("preorder_popup_settings")
    .select("product_id")
    .eq("id", true)
    .maybeSingle();

  if (existingSettings.error) {
    settingsRedirect(
      "error",
      existingSettings.error.message,
    );
  }

  let preorderProductId =
    existingSettings.data?.product_id ?? null;

  if (preorderProductId) {
    const ownedProduct = await admin
      .from("products")
      .select("id")
      .eq("id", preorderProductId)
      .eq("is_preorder_only", true)
      .maybeSingle();

    if (!ownedProduct.data) {
      preorderProductId = null;
    }
  }

  if (!preorderProductId) {
    const existingPreorderProduct = await admin
      .from("products")
      .select("id")
      .eq("is_preorder_only", true)
      .limit(1)
      .maybeSingle();

    if (existingPreorderProduct.error) {
      settingsRedirect(
        "error",
        existingPreorderProduct.error.message,
      );
    }

    preorderProductId =
      existingPreorderProduct.data?.id ?? null;
  }

  const productValues = {
    name: gameTitle,
    description,
    image_url: imageUrl,
    currency: "USD",
    price: standardPrice,
    delivery_type: "MANUAL",
    status: isEnabled ? "ACTIVE" : "INACTIVE",
    is_featured: false,
    minimum_quantity: 1,
    maximum_quantity: 1,
    stock_quantity: 999999,
    badge: "Preorder",
    region: "Global",
    product_type: "GAME_KEY",
    allows_fixed_values: true,
    allows_custom_value: false,
    is_preorder_only: true,
  };

  if (preorderProductId) {
    const productUpdate = await admin
      .from("products")
      .update(productValues)
      .eq("id", preorderProductId);

    if (productUpdate.error) {
      settingsRedirect(
        "error",
        productUpdate.error.message,
      );
    }
  } else {
    const productInsert = await admin
      .from("products")
      .insert({
        ...productValues,
        slug: `preorder-${Date.now()}`,
      })
      .select("id")
      .single();

    if (productInsert.error) {
      settingsRedirect(
        "error",
        productInsert.error.message,
      );
    }

    preorderProductId = productInsert.data.id;
  }

  const optionResult = await admin
    .from("product_options")
    .select("id, option_name")
    .eq("product_id", preorderProductId);

  if (optionResult.error) {
    settingsRedirect(
      "error",
      optionResult.error.message,
    );
  }

  const editions = [
    {
      optionName: "Standard Edition",
      price: standardPrice,
      sortOrder: 0,
    },
    {
      optionName: "Ultimate Edition",
      price: ultimatePrice,
      sortOrder: 1,
    },
  ];

  for (const edition of editions) {
    const existingOption =
      optionResult.data?.find(
        (option) =>
          option.option_name ===
          edition.optionName,
      );
    const optionValues = {
      option_name: edition.optionName,
      option_type: "EDITION",
      selling_price: edition.price,
      stock_quantity: 999999,
      is_custom_value: false,
      is_active: true,
      sort_order: edition.sortOrder,
    };

    const editionResult = existingOption
      ? await admin
          .from("product_options")
          .update(optionValues)
          .eq("id", existingOption.id)
      : await admin
          .from("product_options")
          .insert({
            ...optionValues,
            product_id: preorderProductId,
          });

    if (editionResult.error) {
      settingsRedirect(
        "error",
        editionResult.error.message,
      );
    }
  }

  const settingsResult = await admin
    .from("preorder_popup_settings")
    .upsert({
      id: true,
      is_enabled: isEnabled,
      product_id: preorderProductId,
      game_title: gameTitle,
      description,
      image_url: imageUrl,
      launch_date:
        parsedLaunchDate.toISOString(),
      preorder_price: standardPrice,
      ultimate_price: ultimatePrice,
      bonus_text: bonusText,
      button_text: buttonText,
    });

  if (settingsResult.error) {
    settingsRedirect(
      "error",
      settingsResult.error.message,
    );
  }

  revalidatePath("/");
  revalidatePath("/preorder");
  revalidatePath("/admin/preorder-popup");
  settingsRedirect(
    "success",
    "Independent preorder product saved.",
  );
}
