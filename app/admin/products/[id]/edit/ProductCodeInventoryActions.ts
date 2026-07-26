"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function productEditPath(productId: string) {
  return `/admin/products/${productId}/edit`;
}

function redirectWithMessage(
  productId: string,
  type: "error" | "success",
  message: string,
): never {
  redirect(
    `${productEditPath(productId)}?${type}=${encodeURIComponent(message)}#code-inventory`,
  );
}

async function requireAdmin() {
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

  return user;
}

async function syncAvailableCodeStock(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  productOptionId: string,
) {
  const countResult = await admin
    .from("gift_card_codes")
    .select("id", { count: "exact", head: true })
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

  const totalStock = (optionsResult.data ?? []).reduce(
    (total, option) => total + Number(option.stock_quantity ?? 0),
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

export async function addProductCodes(formData: FormData) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const productId = String(formData.get("product_id") ?? "").trim();
  const productOptionId = String(
    formData.get("product_option_id") ?? "",
  ).trim();
  const note = String(formData.get("note") ?? "").trim();
  const rawCodes = String(formData.get("codes") ?? "");

  if (!productId) {
    redirect("/admin/products");
  }

  if (!productOptionId) {
    redirectWithMessage(productId, "error", "Please select a product option.");
  }

  const productResult = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (productResult.error || !productResult.data) {
    redirectWithMessage(productId, "error", "The selected product was not found.");
  }

  const optionResult = await admin
    .from("product_options")
    .select("id, product_id, denomination")
    .eq("id", productOptionId)
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (optionResult.error || !optionResult.data) {
    redirectWithMessage(
      productId,
      "error",
      "The selected product option is invalid or inactive.",
    );
  }

  const verifiedOption = optionResult.data;

  const uniqueCodes = Array.from(
    new Set(
      rawCodes
        .split(/\r?\n/)
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  );

  if (uniqueCodes.length === 0) {
    redirectWithMessage(productId, "error", "Enter at least one voucher code.");
  }

  if (uniqueCodes.length > 100) {
    redirectWithMessage(
      productId,
      "error",
      "You can upload a maximum of 100 codes at once.",
    );
  }

  if (uniqueCodes.some((code) => code.length < 4 || code.length > 500)) {
    redirectWithMessage(
      productId,
      "error",
      "Every code must contain between 4 and 500 characters.",
    );
  }

  const insertResult = await admin.from("gift_card_codes").insert(
    uniqueCodes.map((code) => ({
      product_id: productId,
      product_option_id: verifiedOption.id,
      denomination: verifiedOption.denomination ?? null,
      code,
      note: note || null,
      status: "AVAILABLE",
      created_by: user.id,
    })),
  );

  if (insertResult.error) {
    const message =
      insertResult.error.code === "23505"
        ? "One or more codes already exist. No codes were uploaded."
        : `Unable to upload codes: ${insertResult.error.message}`;
    redirectWithMessage(productId, "error", message);
  }

  try {
    await syncAvailableCodeStock(admin, productId, productOptionId);
  } catch (error) {
    redirectWithMessage(
      productId,
      "error",
      error instanceof Error
        ? `Codes were uploaded, but stock synchronization failed: ${error.message}`
        : "Codes were uploaded, but stock synchronization failed.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");
  revalidatePath(productEditPath(productId));
  revalidatePath("/");
  revalidatePath("/products");

  redirectWithMessage(
    productId,
    "success",
    `${uniqueCodes.length} voucher code(s) uploaded successfully.`,
  );
}

export async function changeProductCodeStatus(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const productId = String(formData.get("product_id") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "");

  if (!productId) {
    redirect("/admin/products");
  }

  if (!id || (status !== "AVAILABLE" && status !== "DISABLED")) {
    redirectWithMessage(productId, "error", "Invalid code status request.");
  }

  const codeResult = await admin
    .from("gift_card_codes")
    .select("product_id, product_option_id")
    .eq("id", id)
    .eq("product_id", productId)
    .maybeSingle();

  if (codeResult.error || !codeResult.data?.product_option_id) {
    redirectWithMessage(productId, "error", "Voucher code was not found.");
  }

  const updateResult = await admin
    .from("gift_card_codes")
    .update({ status })
    .eq("id", id)
    .eq("product_id", productId)
    .in("status", ["AVAILABLE", "DISABLED"]);

  if (updateResult.error) {
    redirectWithMessage(
      productId,
      "error",
      `Unable to update code: ${updateResult.error.message}`,
    );
  }

  try {
    await syncAvailableCodeStock(
      admin,
      productId,
      codeResult.data.product_option_id,
    );
  } catch (error) {
    redirectWithMessage(
      productId,
      "error",
      error instanceof Error
        ? `Code status changed, but stock synchronization failed: ${error.message}`
        : "Code status changed, but stock synchronization failed.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");
  revalidatePath(productEditPath(productId));
  revalidatePath("/");
  revalidatePath("/products");

  redirectWithMessage(productId, "success", "Voucher code status updated.");
}

export async function addCodesForOption(
  productId: string,
  productOptionId: string,
  fieldKey: string,
  formData: FormData,
) {
  const payload = new FormData();
  payload.set("product_id", productId);
  payload.set("product_option_id", productOptionId);
  payload.set("codes", String(formData.get(`codes_${fieldKey}`) ?? ""));
  payload.set("note", String(formData.get(`code_note_${fieldKey}`) ?? ""));
  return addProductCodes(payload);
}

export async function changeCodeStatusForOption(
  productId: string,
  codeId: string,
  status: "AVAILABLE" | "DISABLED",
  _formData: FormData,
) {
  const payload = new FormData();
  payload.set("product_id", productId);
  payload.set("id", codeId);
  payload.set("status", status);
  return changeProductCodeStatus(payload);
}

export async function deleteProductCode(
  productId: string,
  codeId: string,
  _formData: FormData,
) {
  await requireAdmin();
  const admin = createAdminClient();

  const codeResult = await admin
    .from("gift_card_codes")
    .select("id, product_id, product_option_id, status")
    .eq("id", codeId)
    .eq("product_id", productId)
    .maybeSingle();

  if (
    codeResult.error ||
    !codeResult.data ||
    !codeResult.data.product_option_id
  ) {
    redirectWithMessage(productId, "error", "Voucher code was not found.");
  }

  if (
    codeResult.data.status !== "AVAILABLE" &&
    codeResult.data.status !== "DISABLED"
  ) {
    redirectWithMessage(
      productId,
      "error",
      "Sold or reserved codes cannot be deleted.",
    );
  }

  const deleteResult = await admin
    .from("gift_card_codes")
    .delete()
    .eq("id", codeId)
    .eq("product_id", productId)
    .in("status", ["AVAILABLE", "DISABLED"]);

  if (deleteResult.error) {
    redirectWithMessage(
      productId,
      "error",
      `Unable to delete code: ${deleteResult.error.message}`,
    );
  }

  try {
    await syncAvailableCodeStock(
      admin,
      productId,
      codeResult.data.product_option_id,
    );
  } catch (error) {
    redirectWithMessage(
      productId,
      "error",
      error instanceof Error
        ? `Code was deleted, but stock synchronization failed: ${error.message}`
        : "Code was deleted, but stock synchronization failed.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/gift-codes");
  revalidatePath(productEditPath(productId));
  revalidatePath("/");
  revalidatePath("/products");

  redirectWithMessage(productId, "success", "Voucher code deleted permanently.");
}
