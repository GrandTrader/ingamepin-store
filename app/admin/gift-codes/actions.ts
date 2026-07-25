"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function syncAvailableCodeStock(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  productOptionId: string,
) {
  const countResult = await admin
    .from("gift_card_codes")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("product_option_id", productOptionId)
    .eq("status", "AVAILABLE");

  if (countResult.error) {
    throw new Error(countResult.error.message);
  }

  const optionUpdate = await admin
    .from("product_options")
    .update({
      stock_quantity: countResult.count ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productOptionId);

  if (optionUpdate.error) {
    throw new Error(optionUpdate.error.message);
  }

  const optionsResult = await admin
    .from("product_options")
    .select("stock_quantity")
    .eq("product_id", productId)
    .eq("is_active", true);

  if (optionsResult.error) {
    throw new Error(optionsResult.error.message);
  }

  const totalStock = (
    optionsResult.data ?? []
  ).reduce(
    (total, option) =>
      total + Number(option.stock_quantity ?? 0),
    0,
  );

  const productUpdate = await admin
    .from("products")
    .update({
      stock_quantity: totalStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (productUpdate.error) {
    throw new Error(productUpdate.error.message);
  }
}

function redirectWithError(message: string): never {
  redirect(
    `/admin/gift-codes?error=${encodeURIComponent(
      message,
    )}`,
  );
}

async function getAdminContext() {
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

  return {
    supabase,
    user,
  };
}

export async function addGiftCodes(
  formData: FormData,
) {
  const { supabase, user } =
    await getAdminContext();
  const admin = createAdminClient();

  const productId = String(
    formData.get("product_id") ?? "",
  ).trim();

  const productOptionId = String(
    formData.get("product_option_id") ?? "",
  ).trim();

  const note = String(
    formData.get("note") ?? "",
  ).trim();

  const rawCodes = String(
    formData.get("codes") ?? "",
  );

  if (!productId) {
    redirectWithError(
      "Please select a product.",
    );
  }

  if (!productOptionId) {
    redirectWithError(
      "Please select a product option.",
    );
  }

  const productResult = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (productResult.error) {
    redirectWithError(
      `Unable to verify product: ${productResult.error.message}`,
    );
  }

  if (!productResult.data) {
    redirectWithError(
      "The selected product is unavailable.",
    );
  }

  const optionResult = await supabase
    .from("product_options")
    .select(
      "id, product_id, option_name, denomination",
    )
    .eq("id", productOptionId)
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (optionResult.error) {
    redirectWithError(
      `Unable to verify product option: ${optionResult.error.message}`,
    );
  }

  if (!optionResult.data) {
    redirectWithError(
      "The selected product option is invalid or inactive.",
    );
  }

  const verifiedOption = optionResult.data;

  const parsedCodes = rawCodes
    .split(/\r?\n/)
    .map((code) => code.trim())
    .filter(Boolean);

  const uniqueCodes = Array.from(
    new Set(parsedCodes),
  );

  if (uniqueCodes.length === 0) {
    redirectWithError(
      "Enter at least one gift-card code.",
    );
  }

  if (uniqueCodes.length > 100) {
    redirectWithError(
      "You can add a maximum of 100 codes at once.",
    );
  }

  if (
    uniqueCodes.some(
      (code) =>
        code.length < 4 ||
        code.length > 500,
    )
  ) {
    redirectWithError(
      "Every gift-card code must contain between 4 and 500 characters.",
    );
  }

  const giftCodes = uniqueCodes.map(
    (code) => ({
      product_id: productId,
      product_option_id:
        verifiedOption.id,
      denomination:
        verifiedOption.denomination ?? null,
      code,
      note: note || null,
      status: "AVAILABLE",
      created_by: user.id,
    }),
  );

  const insertResult = await admin
    .from("gift_card_codes")
    .insert(giftCodes);

  if (insertResult.error) {
    if (
      insertResult.error.code === "23505"
    ) {
      redirectWithError(
        "One or more codes already exist. No codes were added.",
      );
    }

    redirectWithError(
      `Unable to add codes: ${insertResult.error.message}`,
    );
  }

  try {
    await syncAvailableCodeStock(
      admin,
      productId,
      productOptionId,
    );
  } catch (error) {
    redirectWithError(
      error instanceof Error
        ? `Codes were added, but stock synchronization failed: ${error.message}`
        : "Codes were added, but stock synchronization failed.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");
  revalidatePath("/");
  revalidatePath("/products");

  redirect(
    `/admin/gift-codes?success=${encodeURIComponent(
      `${uniqueCodes.length} gift-card code(s) added successfully`,
    )}`,
  );
}

export async function changeGiftCodeStatus(
  formData: FormData,
) {
  await getAdminContext();
  const admin = createAdminClient();

  const id = String(
    formData.get("id") ?? "",
  ).trim();

  const requestedStatus = String(
    formData.get("status") ?? "",
  );

  if (!id) {
    redirectWithError(
      "Gift-card code ID is missing.",
    );
  }

  if (
    requestedStatus !== "AVAILABLE" &&
    requestedStatus !== "DISABLED"
  ) {
    redirectWithError(
      "Only available or disabled status can be selected manually.",
    );
  }

  const codeResult = await admin
    .from("gift_card_codes")
    .select("product_id, product_option_id")
    .eq("id", id)
    .maybeSingle();

  if (
    codeResult.error ||
    !codeResult.data?.product_option_id
  ) {
    redirectWithError(
      "Gift-card code was not found.",
    );
  }

  const updateResult = await admin
    .from("gift_card_codes")
    .update({
      status: requestedStatus,
    })
    .eq("id", id)
    .in("status", [
      "AVAILABLE",
      "DISABLED",
    ]);

  if (updateResult.error) {
    redirectWithError(
      `Unable to update code: ${updateResult.error.message}`,
    );
  }

  try {
    await syncAvailableCodeStock(
      admin,
      codeResult.data.product_id,
      codeResult.data.product_option_id,
    );
  } catch (error) {
    redirectWithError(
      error instanceof Error
        ? `Code status changed, but stock synchronization failed: ${error.message}`
        : "Code status changed, but stock synchronization failed.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");
  revalidatePath("/");
  revalidatePath("/products");

  redirect(
    "/admin/gift-codes?success=Code status updated",
  );
}
