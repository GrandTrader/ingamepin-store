"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const supportedNetworks = ["TRC20", "BEP20", "SOLANA"] as const;

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

function affiliateRedirect(kind: "error" | "success", message: string): never {
  redirect(`/admin/affiliates?${kind}=${encodeURIComponent(message)}`);
}

export async function saveAffiliateSettings(formData: FormData) {
  await requireAdministrator();

  const programEnabled = formData.get("program_enabled") === "on";
  const minimumPayout = Number(formData.get("minimum_payout"));
  const holdingDays = Number(formData.get("holding_days"));
  const cookieDays = Number(formData.get("cookie_days"));
  const payoutNetworks = formData
    .getAll("payout_networks")
    .map((value) => String(value).toUpperCase())
    .filter((value): value is (typeof supportedNetworks)[number] =>
      supportedNetworks.includes(value as (typeof supportedNetworks)[number]),
    );

  if (!Number.isFinite(minimumPayout) || minimumPayout < 1 || minimumPayout > 100000) {
    affiliateRedirect("error", "Minimum payout must be between 1 and 100,000 USDT.");
  }

  if (!Number.isInteger(holdingDays) || holdingDays < 0 || holdingDays > 90) {
    affiliateRedirect("error", "Holding period must be between 0 and 90 days.");
  }

  if (!Number.isInteger(cookieDays) || cookieDays < 1 || cookieDays > 365) {
    affiliateRedirect("error", "Referral tracking must be between 1 and 365 days.");
  }

  if (payoutNetworks.length === 0) {
    affiliateRedirect("error", "Enable at least one USDT payout network.");
  }

  const result = await createAdminClient()
    .from("affiliate_settings")
    .upsert({
      id: 1,
      program_enabled: programEnabled,
      minimum_payout: Number(minimumPayout.toFixed(2)),
      holding_days: holdingDays,
      payout_currency: "USDT",
      payout_networks: Array.from(new Set(payoutNetworks)),
      cookie_days: cookieDays,
      updated_at: new Date().toISOString(),
    });

  if (result.error) {
    affiliateRedirect("error", result.error.message);
  }

  revalidatePath("/admin/affiliates");
  affiliateRedirect("success", "Affiliate settings saved successfully.");
}

export async function saveAffiliateProductSettings(formData: FormData) {
  await requireAdministrator();

  const productId = String(formData.get("product_id") ?? "").trim();
  const affiliateEnabled = formData.get("affiliate_enabled") === "on";
  const commissionPercent = Number(formData.get("affiliate_commission_percent"));

  if (!productId) {
    affiliateRedirect("error", "Product information is invalid.");
  }

  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 25) {
    affiliateRedirect("error", "Product commission must be between 0% and 25%.");
  }

  if (affiliateEnabled && commissionPercent <= 0) {
    affiliateRedirect("error", "Set a commission above 0% before enabling the product.");
  }

  const result = await createAdminClient()
    .from("products")
    .update({
      affiliate_enabled: affiliateEnabled,
      affiliate_commission_percent: Math.round(commissionPercent * 100) / 100,
      affiliate_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select("name")
    .maybeSingle();

  if (result.error) {
    affiliateRedirect("error", result.error.message);
  }

  if (!result.data) {
    affiliateRedirect("error", "Product was not found.");
  }

  revalidatePath("/admin/affiliates");
  revalidatePath("/account/affiliate");
  revalidatePath("/");
  affiliateRedirect("success", `Affiliate settings saved for ${result.data.name}.`);
}
