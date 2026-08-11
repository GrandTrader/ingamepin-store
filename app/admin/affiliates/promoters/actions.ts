"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const allowedStatuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;

function promoterRedirect(kind: "success" | "error", message: string): never {
  redirect(
    `/admin/affiliates/promoters?${kind}=${encodeURIComponent(message)}`,
  );
}

async function requireAdministrator() {
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

  return user;
}

export async function savePromoterSettings(formData: FormData) {
  const administrator = await requireAdministrator();
  const affiliateId = String(formData.get("affiliate_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toUpperCase();
  const overrideValue = String(
    formData.get("commission_override_percent") ?? "",
  ).trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(affiliateId)) {
    promoterRedirect("error", "Promoter information is invalid.");
  }

  if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
    promoterRedirect("error", "Select a valid promoter status.");
  }

  let commissionOverride: number | null = null;

  if (overrideValue) {
    commissionOverride = Number(overrideValue);

    if (
      !Number.isFinite(commissionOverride) ||
      commissionOverride < 0.01 ||
      commissionOverride > 25
    ) {
      promoterRedirect(
        "error",
        "Custom promoter commission must be between 0.01% and 25%.",
      );
    }

    commissionOverride = Math.round(commissionOverride * 100) / 100;
  }

  const now = new Date().toISOString();
  const updateResult = await createAdminClient()
    .from("affiliate_accounts")
    .update({
      status,
      commission_override_percent: commissionOverride,
      approved_by: status === "APPROVED" ? administrator.id : null,
      approved_at: status === "APPROVED" ? now : null,
      rejected_at: status === "REJECTED" ? now : null,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", affiliateId);

  if (updateResult.error) {
    promoterRedirect("error", updateResult.error.message);
  }

  revalidatePath("/admin/affiliates/promoters");
  promoterRedirect("success", "Promoter settings saved successfully.");
}
