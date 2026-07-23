"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function resultRedirect(kind: "success" | "error", message: string, email = ""): never {
  const query = new URLSearchParams({ [kind]: message });
  if (email) query.set("email", email);
  redirect(`/admin/customer-discounts?${query.toString()}`);
}

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) redirect("/admin/login?error=Access denied");
}

export async function saveCustomerDiscounts(formData: FormData) {
  await requireAdministrator();

  const email = String(formData.get("customer_email") ?? "").trim().toLowerCase();
  const productIds = Array.from(
    new Set(formData.getAll("product_ids").map((value) => String(value).trim()).filter(Boolean)),
  );

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    resultRedirect("error", "Enter a valid registered customer email.");
  }

  if (productIds.length === 0) {
    resultRedirect("error", "Select at least one product.", email);
  }

  const admin = createAdminClient();
  const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const customer = usersResult.data.users.find(
    (user) => user.email?.toLowerCase() === email,
  );

  if (usersResult.error || !customer) {
    resultRedirect("error", "A registered customer with this email was not found.", email);
  }

  const productResult = await admin
    .from("products")
    .select("id")
    .in("id", productIds)
    .eq("status", "ACTIVE");

  if (productResult.error || (productResult.data ?? []).length !== productIds.length) {
    resultRedirect("error", "One or more selected products are unavailable.", email);
  }

  const discountRows = productIds.map((productId) => {
    const discountPercent = Number(
      formData.get(`discount_percent_${productId}`),
    );

    if (
      !Number.isFinite(discountPercent) ||
      discountPercent <= 0 ||
      discountPercent > 100
    ) {
      resultRedirect(
        "error",
        "Each selected product must have a discount greater than 0% and no more than 100%.",
        email,
      );
    }

    return {
      productId,
      discountPercent,
    };
  });

  const deleteResult = await admin
    .from("customer_product_discounts")
    .delete()
    .eq("user_id", customer.id);

  if (deleteResult.error) {
    resultRedirect("error", `Unable to replace customer discounts: ${deleteResult.error.message}`, email);
  }

  const insertResult = await admin.from("customer_product_discounts").insert(
    discountRows.map((discount) => ({
      user_id: customer.id,
      product_id: discount.productId,
      discount_percent: discount.discountPercent,
      is_active: true,
      updated_at: new Date().toISOString(),
    })),
  );

  if (insertResult.error) {
    resultRedirect("error", `Unable to save customer discounts: ${insertResult.error.message}`, email);
  }

  revalidatePath("/admin/customer-discounts");
  revalidatePath("/admin/customers");
  resultRedirect("success", "Customer product discounts saved successfully.", email);
}

export async function removeCustomerDiscounts(formData: FormData) {
  await requireAdministrator();
  const email = String(formData.get("customer_email") ?? "").trim().toLowerCase();
  const admin = createAdminClient();
  const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const customer = usersResult.data.users.find((user) => user.email?.toLowerCase() === email);

  if (!customer) resultRedirect("error", "Registered customer was not found.", email);

  const deleteResult = await admin
    .from("customer_product_discounts")
    .delete()
    .eq("user_id", customer.id);

  if (deleteResult.error) {
    resultRedirect("error", deleteResult.error.message, email);
  }

  revalidatePath("/admin/customer-discounts");
  revalidatePath("/admin/customers");
  resultRedirect("success", "Customer discounts removed.", email);
}
