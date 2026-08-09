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
  const storeUsdInrRate = Number(formData.get("store_usd_inr_rate"));

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

  if (
    !Number.isFinite(storeUsdInrRate) ||
    storeUsdInrRate < 1 ||
    storeUsdInrRate > 1000
  ) {
    settingsRedirect(
      "error",
      "Enter a valid INR storefront exchange rate from 1 to 1000.",
    );
  }

  const result = await createAdminClient()
    .from("payment_gateway_settings")
    .upsert({
      id: true,
      pally_usd_rub_rate: Number(pallyUsdRubRate.toFixed(4)),
      store_usd_rub_rate: Number(storeUsdRubRate.toFixed(4)),
      store_usd_inr_rate: Number(storeUsdInrRate.toFixed(4)),
    });

  if (result.error) {
    settingsRedirect("error", result.error.message);
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/api/store-settings");
  settingsRedirect("success", "Payment and storefront exchange rates saved.");
}

const gatewayIds = [
  "WALLET",
  "UPI",
  "BINANCE_PAY",
  "USDT_DIRECT",
  "PALLY",
  "FREEKASSA",
] as const;

type GatewayId = (typeof gatewayIds)[number];
type CommissionType = "PERCENTAGE" | "FIXED";

type GatewayCommission = {
  type: CommissionType;
  value: number;
  enabled: boolean;
};

export async function saveGatewayCommissions(formData: FormData) {
  await requireAdministrator();

  const gatewayCommissions = gatewayIds.reduce(
    (settings, gatewayId) => {
      const typeValue = String(
        formData.get(`${gatewayId}_type`) ?? "PERCENTAGE",
      );
      const type: CommissionType =
        typeValue === "FIXED" ? "FIXED" : "PERCENTAGE";
      const value = Number(formData.get(`${gatewayId}_value`));
      const enabled = formData.get(`${gatewayId}_enabled`) === "on";

      if (!Number.isFinite(value) || value < 0) {
        settingsRedirect(
          "error",
          `Enter a valid non-negative commission for ${gatewayId}.`,
        );
      }

      if (type === "PERCENTAGE" && value > 100) {
        settingsRedirect(
          "error",
          `Percentage commission for ${gatewayId} cannot exceed 100%.`,
        );
      }

      if (type === "FIXED" && value > 100000) {
        settingsRedirect(
          "error",
          `Fixed commission for ${gatewayId} cannot exceed $100,000.`,
        );
      }

      settings[gatewayId] = {
        type,
        value: Number(value.toFixed(4)),
        enabled,
      };

      return settings;
    },
    {} as Record<GatewayId, GatewayCommission>,
  );

  const result = await createAdminClient()
    .from("payment_gateway_settings")
    .upsert({
      id: true,
      gateway_commissions: gatewayCommissions,
    });

  if (result.error) {
    settingsRedirect("error", result.error.message);
  }

  revalidatePath("/admin/payment-settings");
  revalidatePath("/checkout");
  revalidatePath("/api/orders");
  settingsRedirect("success", "Payment gateway commissions saved.");
}
