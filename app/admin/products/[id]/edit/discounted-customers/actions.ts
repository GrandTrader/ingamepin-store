"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function pagePath(productId: string) {
  return `/admin/products/${productId}/edit/discounted-customers`;
}

function resultRedirect(productId: string, kind: "success" | "error", message: string): never {
  redirect(`${pagePath(productId)}?${kind}=${encodeURIComponent(message)}`);
}

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
}

function discountPercent(formData: FormData, productId: string) {
  const value = Number(formData.get("discount_percent"));
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    resultRedirect(productId, "error", "Enter a discount greater than 0% and no more than 100%.");
  }
  return Math.round(value * 100) / 100;
}

async function findCustomerByEmail(email: string) {
  const admin = createAdminClient();
  let page = 1;

  while (true) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error(result.error.message);
    const customer = result.data.users.find((user) => user.email?.toLowerCase() === email);
    if (customer) return customer;
    if (result.data.users.length < 1000) return null;
    page += 1;
  }
}

export async function addProductCustomerDiscount(formData: FormData) {
  await requireAdministrator();
  const productId = String(formData.get("product_id") ?? "").trim();
  const email = String(formData.get("customer_email") ?? "").trim().toLowerCase();
  const percent = discountPercent(formData, productId);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    resultRedirect(productId, "error", "Enter a valid registered customer email.");
  }

  let customer;
  try {
    customer = await findCustomerByEmail(email);
  } catch (error) {
    resultRedirect(productId, "error", error instanceof Error ? error.message : "Unable to find customer.");
  }
  if (!customer) resultRedirect(productId, "error", "Registered customer was not found.");

  const result = await createAdminClient().from("customer_product_discounts").upsert({
    user_id: customer.id,
    product_id: productId,
    discount_percent: percent,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,product_id" });

  if (result.error) resultRedirect(productId, "error", result.error.message);
  revalidatePath(pagePath(productId));
  revalidatePath("/admin/customers");
  resultRedirect(productId, "success", "Customer discount added.");
}

export async function updateProductCustomerDiscount(formData: FormData) {
  await requireAdministrator();
  const productId = String(formData.get("product_id") ?? "").trim();
  const discountId = String(formData.get("discount_id") ?? "").trim();
  const percent = discountPercent(formData, productId);
  const result = await createAdminClient().from("customer_product_discounts").update({
    discount_percent: percent,
    is_active: true,
    updated_at: new Date().toISOString(),
  }).eq("id", discountId).eq("product_id", productId);

  if (result.error) resultRedirect(productId, "error", result.error.message);
  revalidatePath(pagePath(productId));
  revalidatePath("/admin/customers");
  resultRedirect(productId, "success", "Customer discount updated.");
}

export async function removeProductCustomerDiscount(formData: FormData) {
  await requireAdministrator();
  const productId = String(formData.get("product_id") ?? "").trim();
  const discountId = String(formData.get("discount_id") ?? "").trim();
  const result = await createAdminClient().from("customer_product_discounts").delete().eq("id", discountId).eq("product_id", productId);

  if (result.error) resultRedirect(productId, "error", result.error.message);
  revalidatePath(pagePath(productId));
  revalidatePath("/admin/customers");
  resultRedirect(productId, "success", "Customer discount removed.");
}
