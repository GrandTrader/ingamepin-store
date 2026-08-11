"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function redirectToAffiliate(
  productId: string,
  kind: "success" | "error",
  message: string,
): never {
  redirect(
    `/admin/products/${productId}/edit/affiliate?${kind}=${encodeURIComponent(message)}`,
  );
}

export async function saveProductAffiliateSettings(formData: FormData) {
  const productId = String(formData.get("id") ?? "").trim();

  if (!productId) {
    redirect("/admin/products?error=Product%20information%20is%20invalid");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const accessResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!accessResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const affiliateEnabled = formData.get("affiliate_enabled") === "on";
  const commissionPercent = Number(
    String(formData.get("affiliate_commission_percent") ?? "0").trim(),
  );

  if (
    !Number.isFinite(commissionPercent) ||
    commissionPercent < 0 ||
    commissionPercent > 25
  ) {
    redirectToAffiliate(
      productId,
      "error",
      "Affiliate commission must be between 0% and 25%.",
    );
  }

  if (affiliateEnabled && commissionPercent <= 0) {
    redirectToAffiliate(
      productId,
      "error",
      "Enter a commission greater than 0% before enabling this product.",
    );
  }

  const admin = createAdminClient();
  const updateResult = await admin
    .from("products")
    .update({
      affiliate_enabled: affiliateEnabled,
      affiliate_commission_percent: Math.round(commissionPercent * 100) / 100,
      affiliate_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (updateResult.error) {
    redirectToAffiliate(productId, "error", updateResult.error.message);
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}/edit/affiliate`);
  revalidatePath("/");

  redirectToAffiliate(
    productId,
    "success",
    "Product affiliate settings saved successfully.",
  );
}
