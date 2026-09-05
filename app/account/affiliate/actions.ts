"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyAdminsByPush } from "@/lib/admin-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function affiliateRedirect(kind: "success" | "error", message: string): never {
  redirect(`/account/affiliate?${kind}=${encodeURIComponent(message)}`);
}

export async function submitAffiliateApplication(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account?error=Please sign in to continue.");
  }

  const settingsResult = await createAdminClient()
    .from("affiliate_settings")
    .select("program_enabled")
    .eq("id", 1)
    .maybeSingle();

  if (settingsResult.error || !settingsResult.data?.program_enabled) {
    affiliateRedirect("error", "Affiliate applications are currently closed.");
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const countryCode = String(formData.get("country_code") ?? "")
    .trim()
    .toUpperCase();
  const promotionChannel = String(
    formData.get("promotion_channel") ?? "",
  )
    .trim()
    .toUpperCase();
  const promotionUrl = String(formData.get("promotion_url") ?? "").trim();
  const promotionPlan = String(formData.get("promotion_plan") ?? "").trim();
  const termsAccepted =
    String(formData.get("affiliate_terms_accepted") ?? "") === "on";

  if (!termsAccepted) {
    affiliateRedirect(
      "error",
      "Accept the Affiliate Program Terms & Conditions to continue.",
    );
  }

  const result = await supabase.rpc("submit_affiliate_application", {
    p_full_name: fullName,
    p_country_code: countryCode,
    p_promotion_channel: promotionChannel,
    p_promotion_url: promotionUrl || null,
    p_promotion_plan: promotionPlan,
  });

  if (result.error) {
    affiliateRedirect("error", result.error.message);
  }

  try {
    await notifyAdminsByPush(`affiliate-application:${user.id}`, {
      title: "New affiliate application",
      body: `${fullName} submitted an affiliate application.`,
      url: "/admin/affiliates/promoters",
      tag: `affiliate-application-${user.id}`,
    });
  } catch (notificationError) {
    console.error(
      "Affiliate application push notification failed:",
      notificationError,
    );
  }

  revalidatePath("/account/affiliate");
  revalidatePath("/admin/affiliates/promoters");
  affiliateRedirect(
    "success",
    "Affiliate application submitted successfully. Admin approval is pending.",
  );
}

export async function createAffiliatePayoutRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account?error=Please sign in to continue.");
  }

  const amount = Number(String(formData.get("amount") ?? "0").trim());
  const network = String(formData.get("network") ?? "")
    .trim()
    .toUpperCase();
  const walletAddress = String(formData.get("wallet_address") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    affiliateRedirect("error", "The payout amount is invalid.");
  }

  if (!network || walletAddress.length < 20 || walletAddress.length > 150) {
    affiliateRedirect(
      "error",
      "Select a USDT network and enter a valid wallet address.",
    );
  }

  const result = await supabase.rpc("create_affiliate_payout_request", {
    p_amount: Math.round(amount * 100) / 100,
    p_network: network,
    p_wallet_address: walletAddress,
  });

  if (result.error) {
    affiliateRedirect("error", result.error.message);
  }

  revalidatePath("/account/affiliate");
  revalidatePath("/admin/affiliates/payouts");
  affiliateRedirect(
    "success",
    "Payout request submitted successfully for manual administrator review.",
  );
}

export async function setAffiliateProductCommission(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account?error=Please sign in to continue.");
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  const commissionPercent = Number(
    String(formData.get("commission_percent") ?? "0").trim(),
  );

  if (!productId || !Number.isFinite(commissionPercent)) {
    affiliateRedirect("error", "The product commission information is invalid.");
  }

  const result = await supabase.rpc("set_affiliate_product_commission", {
    p_product_id: productId,
    p_commission_percent: Math.round(commissionPercent * 100) / 100,
  });

  if (result.error) {
    affiliateRedirect("error", result.error.message);
  }

  revalidatePath("/account/affiliate");
  affiliateRedirect("success", "Product commission saved successfully.");
}
