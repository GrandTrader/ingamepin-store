"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function reviewsRedirect(
  kind: "success" | "error",
  message: string,
): never {
  redirect(`/admin/reviews?${kind}=${encodeURIComponent(message)}`);
}

async function requireWebsiteAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const accessResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accessResult.data?.role !== "super_admin") {
    redirect("/admin?error=Website administrator access is required");
  }

  return user;
}

export async function hideReview(formData: FormData) {
  const user = await requireWebsiteAdministrator();
  const reviewId = String(formData.get("review_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reviewId) reviewsRedirect("error", "Review ID is missing.");
  if (reason.length < 3 || reason.length > 500) {
    reviewsRedirect(
      "error",
      "Enter a moderation reason between 3 and 500 characters.",
    );
  }

  const result = await createAdminClient()
    .from("order_reviews")
    .update({
      is_visible: false,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
      moderation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (result.error) {
    reviewsRedirect("error", `Unable to hide review: ${result.error.message}`);
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/product/[slug]", "page");
  reviewsRedirect("success", "Review hidden from the website.");
}

export async function restoreReview(formData: FormData) {
  await requireWebsiteAdministrator();
  const reviewId = String(formData.get("review_id") ?? "").trim();

  if (!reviewId) reviewsRedirect("error", "Review ID is missing.");

  const result = await createAdminClient()
    .from("order_reviews")
    .update({
      is_visible: true,
      moderated_at: null,
      moderated_by: null,
      moderation_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (result.error) {
    reviewsRedirect(
      "error",
      `Unable to restore review: ${result.error.message}`,
    );
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/product/[slug]", "page");
  reviewsRedirect("success", "Review restored to the website.");
}
