"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function customerRedirect(
  customerId: string,
  kind: "success" | "error",
  message: string,
): never {
  const query = new URLSearchParams({
    selected: customerId,
    [kind]: message,
  });

  redirect(`/admin/customers?${query.toString()}`);
}

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

export async function saveCustomerDiscount(
  formData: FormData,
) {
  await requireAdministrator();

  const customerId = String(
    formData.get("customer_id") ?? "",
  ).trim();
  const productIds = Array.from(
    new Set(
      formData
        .getAll("product_ids")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      customerId,
    )
  ) {
    customerRedirect(
      customerId,
      "error",
      "The selected customer is invalid.",
    );
  }

  const admin = createAdminClient();
  const customerResult =
    await admin.auth.admin.getUserById(
      customerId,
    );

  if (
    customerResult.error ||
    !customerResult.data.user
  ) {
    customerRedirect(
      customerId,
      "error",
      "Registered customer was not found.",
    );
  }

  if (productIds.length === 0) {
    const deleteResult = await admin
      .from("customer_product_discounts")
      .delete()
      .eq("user_id", customerId);

    if (deleteResult.error) {
      customerRedirect(
        customerId,
        "error",
        deleteResult.error.message,
      );
    }

    revalidatePath("/admin/customers");
    revalidatePath(
      "/admin/customer-discounts",
    );
    customerRedirect(
      customerId,
      "success",
      "All customer discounts were removed.",
    );
  }

  const productsResult = await admin
    .from("products")
    .select("id")
    .eq("status", "ACTIVE");

  if (productsResult.error) {
    customerRedirect(
      customerId,
      "error",
      productsResult.error.message,
    );
  }

  const activeProductIds = (
    productsResult.data ?? []
  ).map((product) => product.id);
  const activeProductIdSet = new Set(
    activeProductIds,
  );

  if (
    productIds.some(
      (id) =>
        !activeProductIdSet.has(id),
    )
  ) {
    customerRedirect(
      customerId,
      "error",
      "Select at least one available product.",
    );
  }

  const discountRows = productIds.map(
    (productId) => {
      const discountPercent = Number(
        formData.get(
          `discount_percent_${productId}`,
        ),
      );

      if (
        !Number.isFinite(
          discountPercent,
        ) ||
        discountPercent <= 0 ||
        discountPercent > 100
      ) {
        customerRedirect(
          customerId,
          "error",
          "Each enabled product must have a discount greater than 0% and no more than 100%.",
        );
      }

      return {
        productId,
        discountPercent,
      };
    },
  );

  const deleteResult = await admin
    .from("customer_product_discounts")
    .delete()
    .eq("user_id", customerId);

  if (deleteResult.error) {
    customerRedirect(
      customerId,
      "error",
      deleteResult.error.message,
    );
  }

  const now = new Date().toISOString();
  const insertResult = await admin
    .from("customer_product_discounts")
    .insert(
      discountRows.map((discount) => ({
        user_id: customerId,
        product_id:
          discount.productId,
        discount_percent:
          discount.discountPercent,
        is_active: true,
        updated_at: now,
      })),
    );

  if (insertResult.error) {
    customerRedirect(
      customerId,
      "error",
      insertResult.error.message,
    );
  }

  revalidatePath("/admin/customers");
  revalidatePath(
    "/admin/customer-discounts",
  );
  revalidatePath("/");
  revalidatePath("/products");

  customerRedirect(
    customerId,
    "success",
    "Customer discount saved successfully.",
  );
}
