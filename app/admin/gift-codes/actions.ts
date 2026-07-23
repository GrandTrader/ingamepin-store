"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

  const insertResult = await supabase
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

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");

  redirect(
    `/admin/gift-codes?success=${encodeURIComponent(
      `${uniqueCodes.length} gift-card code(s) added successfully`,
    )}`,
  );
}

export async function changeGiftCodeStatus(
  formData: FormData,
) {
  const { supabase } =
    await getAdminContext();

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

  const updateResult = await supabase
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

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");

  redirect(
    "/admin/gift-codes?success=Code status updated",
  );
}
