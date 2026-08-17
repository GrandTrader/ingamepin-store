"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAYMENT_METHODS = [
  "WALLET",
  "BINANCE_PAY",
  "USDT_DIRECT",
  "PALLY",
  "FREEKASSA",
] as const;
const USDT_NETWORKS = ["TRC20", "BEP20", "SOLANA"] as const;

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
}

export async function saveProductRestriction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const path = `/admin/products/${id}/edit/restrictions`;
  await requireAdministrator();

  const allowedPaymentMethods = PAYMENT_METHODS.filter(
    (method) => formData.get(`payment_method_${method}`) === "on",
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
    redirect(`${path}?error=${encodeURIComponent("Enter a valid weekly limit")}`);
  }

  const admin = createAdminClient();
  const productResult = await admin
    .from("products")
    .update({
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
    is_enabled: formData.get("is_enabled") === "on",
    weekly_limit: weeklyLimit,
    limit_currency: String(formData.get("limit_currency") ?? "INR"),
    identity_mode: String(formData.get("identity_mode") ?? "ACCOUNT_EMAIL_IP"),
    reset_mode: String(formData.get("reset_mode") ?? "ROLLING_7_DAYS"),
    notification_message: String(formData.get("notification_message") ?? "").trim(),
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
