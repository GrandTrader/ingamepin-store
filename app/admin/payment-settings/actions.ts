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

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");
}

function settingsRedirect(kind: "error" | "success", message: string): never {
  redirect(`/admin/payment-settings?${kind}=${encodeURIComponent(message)}`);
}

export async function savePaymentSettings(formData: FormData) {
  await requireAdministrator();

  const pallyUsdRubRate = Number(formData.get("pally_usd_rub_rate"));
  const storeUsdRubRate = Number(formData.get("store_usd_rub_rate"));

  if (
    !Number.isFinite(pallyUsdRubRate) ||
    pallyUsdRubRate < 1 ||
    pallyUsdRubRate > 1000
  ) {
    settingsRedirect("error", "Enter a valid exchange rate from 1 to 1000.");
  }

  if (
    !Number.isFinite(storeUsdRubRate) ||
    storeUsdRubRate < 1 ||
    storeUsdRubRate > 1000
  ) {
    settingsRedirect(
      "error",
      "Enter a valid storefront exchange rate from 1 to 1000.",
    );
  }

  const result = await createAdminClient()
    .from("payment_gateway_settings")
    .upsert({
      id: true,
      pally_usd_rub_rate: Number(pallyUsdRubRate.toFixed(4)),
      store_usd_rub_rate: Number(storeUsdRubRate.toFixed(4)),
    });

  if (result.error) {
    settingsRedirect("error", result.error.message);
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/api/store-settings");
  settingsRedirect("success", "Payment and storefront exchange rates saved.");
}
