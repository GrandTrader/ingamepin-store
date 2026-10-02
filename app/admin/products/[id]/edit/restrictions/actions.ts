"use server";
import { isPurchaseResetPeriod, purchaseLimitMessage } from "@/lib/purchase-restriction";
import { isRestrictionCurrency } from "@/lib/purchase-restriction-currencies";
import { getProductPaypalychRestriction } from "@/lib/paypalych-product-policy-server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-session";

const PAYMENT_METHODS = [
  "WALLET",
  "BINANCE_PAY",
  "USDT_DIRECT",
  "PALLY",
  "FREEKASSA",
  "UPI",
] as const;
const USDT_NETWORKS = ["TRC20", "BEP20", "SOLANA"] as const;

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
}

async function syncProductQuantityEnvelope(productId: string) {
  const admin = createAdminClient();
  const optionsResult = await admin
    .from("product_options")
    .select("minimum_quantity, maximum_quantity")
    .eq("product_id", productId);

  if (optionsResult.error) throw optionsResult.error;

  const minimums = (optionsResult.data ?? [])
    .map((option) => option.minimum_quantity)
    .filter((value): value is number => Number.isSafeInteger(value));
  const maximums = (optionsResult.data ?? [])
    .map((option) => option.maximum_quantity)
    .filter((value): value is number => Number.isSafeInteger(value));

  if (!minimums.length || !maximums.length) return;

  const productResult = await admin
    .from("products")
    .select("minimum_quantity, maximum_quantity")
    .eq("id", productId)
    .single();

  if (productResult.error) throw productResult.error;

  const updateResult = await admin
    .from("products")
    .update({
      minimum_quantity: Math.min(
        Number(productResult.data.minimum_quantity ?? 1),
        ...minimums,
      ),
      maximum_quantity: Math.max(
        Number(productResult.data.maximum_quantity ?? 1),
        ...maximums,
      ),
    })
    .eq("id", productId);

  if (updateResult.error) throw updateResult.error;
}

export async function saveProductRestriction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const path = `/admin/products/${id}/edit/restrictions`;
  await requireAdministrator();

  const minimumQuantity = Number(formData.get("minimum_quantity"));
  if (!Number.isSafeInteger(minimumQuantity) || minimumQuantity < 1) {
    redirect(`${path}?error=${encodeURIComponent("Enter a valid minimum order quantity")}`);
  }

  const paypalychBlocked = Boolean(await getProductPaypalychRestriction(id));
  const allowedPaymentMethods = PAYMENT_METHODS.filter(
    (method) => formData.get(`payment_method_${method}`) === "on" && !(method === "PALLY" && paypalychBlocked),
  );
  const allowedUsdtNetworks = USDT_NETWORKS.filter(
    (network) => formData.get(`usdt_network_${network}`) === "on",
  );

  if (allowedPaymentMethods.length === 0) {
    redirect(`${path}?error=${encodeURIComponent("Select at least one payment method")}`);
  }
  if (allowedPaymentMethods.includes("USDT_DIRECT") && allowedUsdtNetworks.length === 0) {
    redirect(`${path}?error=${encodeURIComponent("Select at least one Direct USDT network")}`);
  }

  const weeklyLimit = Number(formData.get("weekly_limit"));
  if (!Number.isFinite(weeklyLimit) || weeklyLimit <= 0) {
    redirect(`${path}?error=${encodeURIComponent("Enter a valid purchase limit")}`);
  }

  const resetMode = String(formData.get("reset_mode") ?? "ROLLING_7_DAYS");
  const identityMode = String(formData.get("identity_mode") ?? "ACCOUNT_EMAIL_IP");
  const notificationMessage = String(formData.get("notification_message") ?? "").trim() || purchaseLimitMessage;
  if (!isPurchaseResetPeriod(resetMode)) redirect(path + "?error=Select a valid reset period");
  if (!["ACCOUNT_EMAIL_IP", "ACCOUNT_EMAIL", "IP"].includes(identityMode)) redirect(path + "?error=Select a valid customer identity mode");
  if (notificationMessage.length > 500) redirect(path + "?error=Customer notification must be 500 characters or fewer");

  const limitCurrency = String(formData.get("limit_currency") ?? "INR").trim().toUpperCase();
  const enabled = formData.get("is_enabled") === "on";
  if (!isRestrictionCurrency(limitCurrency)) redirect(`${path}?error=${encodeURIComponent("Select a supported limit currency.")}`);
  const admin = createAdminClient();
  if (resetMode === "ROLLING_1_DAY" || resetMode === "ROLLING_30_DAYS") {
    const schema = await admin.from("product_purchase_restriction_exemptions").select("user_id").limit(0);
    if (schema.error) redirect(path + "?error=Apply the purchase restriction database migration before using this reset period.");
  }
  if (enabled) {
    const matchingOptions = await admin.from("product_options").select("id")
      .eq("product_id", id).eq("is_active", true).eq("denomination_currency", limitCurrency).limit(1);
    if (matchingOptions.error) redirect(`${path}?error=${encodeURIComponent("Unable to verify product currencies. Please retry.")}`);
    if (!matchingOptions.data?.length) redirect(`${path}?error=${encodeURIComponent("Choose the currency of an active product denomination.")}`);
  }
  const productResult = await admin
    .from("products")
    .update({
      minimum_quantity: minimumQuantity,
      allowed_payment_methods: allowedPaymentMethods,
      allowed_usdt_networks: allowedPaymentMethods.includes("USDT_DIRECT")
        ? allowedUsdtNetworks
        : USDT_NETWORKS,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (productResult.error) {
    redirect(`${path}?error=${encodeURIComponent(productResult.error.message)}`);
  }
  if (!productResult.data) {
    redirect(`${path}?error=${encodeURIComponent("Product was not found")}`);
  }

  const restrictionResult = await admin.from("product_purchase_restrictions").upsert({
    product_id: id,
    is_enabled: enabled,
    weekly_limit: weeklyLimit,
    limit_currency: limitCurrency,
    identity_mode: identityMode,
    reset_mode: resetMode,
    notification_message: notificationMessage,
    updated_at: new Date().toISOString(),
  });

  if (restrictionResult.error) {
    redirect(`${path}?error=${encodeURIComponent(restrictionResult.error.message)}`);
  }
  revalidatePath(path);
  revalidatePath("/checkout");
  redirect(`${path}?success=${encodeURIComponent("Restrictions saved")}`);
}

export async function saveDenominationQuantity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const path = `/admin/products/${id}/edit/restrictions`;
  await requireAdministrator();
  if (!optionId) redirect(`${path}?error=Select a denomination`);
  const minimum = Number(formData.get("option_minimum_quantity"));
  const maximum = Number(formData.get("option_maximum_quantity"));
  if (!Number.isSafeInteger(minimum) || minimum < 1 || !Number.isSafeInteger(maximum) || maximum < minimum) {
    redirect(`${path}?error=Enter valid denomination quantities`);
  }
  const result = await createAdminClient().from("product_options").update({ minimum_quantity: minimum, maximum_quantity: maximum }).eq("id", optionId).eq("product_id", id);
  if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  try {
    await syncProductQuantityEnvelope(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to synchronize product quantity limits";
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(path);
  redirect(`${path}?success=Denomination quantity saved`);
}

export async function removeDenominationQuantity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const path = `/admin/products/${id}/edit/restrictions`;
  await requireAdministrator();
  const result = await createAdminClient().from("product_options").update({ minimum_quantity: null, maximum_quantity: null }).eq("id", optionId).eq("product_id", id);
  if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(path);
  redirect(`${path}?success=Denomination restriction removed`);
}

function restrictionResultPath(productId: string, kind: "success" | "error", message: string): never {
  redirect("/admin/products/" + productId + "/edit/restrictions?" + kind + "=" + encodeURIComponent(message));
}

async function restrictionProduct(formData: FormData) {
  await requireAdministrator();
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
    redirect("/admin/products?error=Invalid product");
  }
  const admin = createAdminClient();
  const product = await admin.from("products").select("id").eq("id", productId).maybeSingle();
  if (product.error || !product.data) restrictionResultPath(productId, "error", "Unable to find this product.");
  return { admin, productId };
}

export async function exemptCustomerFromPurchaseRestriction(formData: FormData) {
  const { admin, productId } = await restrictionProduct(formData);
  const email = String(formData.get("customer_email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    restrictionResultPath(productId, "error", "Enter a valid registered customer email.");
  }
  let customerId: string | undefined;
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) restrictionResultPath(productId, "error", "Unable to find the customer. Please retry.");
    customerId = result.data.users.find(user => user.email?.trim().toLowerCase() === email)?.id;
    if (customerId || result.data.users.length < 1000) break;
  }
  if (!customerId) restrictionResultPath(productId, "error", "Registered customer was not found.");
  const result = await admin.from("product_purchase_restriction_exemptions").upsert(
    { product_id: productId, user_id: customerId },
    { onConflict: "product_id,user_id", ignoreDuplicates: true },
  );
  if (result.error) restrictionResultPath(productId, "error", "Unable to save the customer exemption. Please retry.");
  revalidatePath("/admin/products/" + productId + "/edit/restrictions");
  restrictionResultPath(productId, "success", "Purchase restriction removed for this customer.");
}

export async function restoreCustomerPurchaseRestriction(formData: FormData) {
  const { admin, productId } = await restrictionProduct(formData);
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    restrictionResultPath(productId, "error", "Select a valid customer.");
  }
  const result = await admin.from("product_purchase_restriction_exemptions")
    .delete().eq("product_id", productId).eq("user_id", userId);
  if (result.error) restrictionResultPath(productId, "error", "Unable to restore the customer restriction. Please retry.");
  revalidatePath("/admin/products/" + productId + "/edit/restrictions");
  restrictionResultPath(productId, "success", "Purchase restriction restored for this customer.");
}
