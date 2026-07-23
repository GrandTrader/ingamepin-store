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

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }
}

function settingsRedirect(
  kind: "error" | "success",
  message: string,
): never {
  redirect(
    `/admin/preorder-popup?${kind}=${encodeURIComponent(message)}`,
  );
}

export async function savePreorderPopup(
  formData: FormData,
) {
  await requireAdministrator();

  const isEnabled =
    formData.get("is_enabled") === "on";
  const productId = String(
    formData.get("product_id") ?? "",
  ).trim();
  const gameTitle = String(
    formData.get("game_title") ?? "",
  ).trim();
  const imageUrl = String(
    formData.get("image_url") ?? "",
  ).trim();
  const launchDate = String(
    formData.get("launch_date") ?? "",
  ).trim();
  const priceInput = String(
    formData.get("preorder_price") ?? "",
  ).trim();
  const bonusText = String(
    formData.get("bonus_text") ?? "",
  ).trim();
  const buttonText =
    String(
      formData.get("button_text") ?? "",
    ).trim() || "PREORDER NOW";

  if (
    isEnabled &&
    (!productId ||
      !gameTitle ||
      !imageUrl ||
      !launchDate)
  ) {
    settingsRedirect(
      "error",
      "Select a product and enter the title, image, and launch date before enabling the popup.",
    );
  }

  if (imageUrl) {
    try {
      new URL(imageUrl);
    } catch {
      settingsRedirect(
        "error",
        "Enter a valid image URL.",
      );
    }
  }

  const parsedLaunchDate = launchDate
    ? new Date(`${launchDate}:00+05:30`)
    : null;

  if (
    parsedLaunchDate &&
    Number.isNaN(parsedLaunchDate.getTime())
  ) {
    settingsRedirect(
      "error",
      "Enter a valid launch date.",
    );
  }

  const preorderPrice = priceInput
    ? Number(priceInput)
    : null;

  if (
    preorderPrice !== null &&
    (!Number.isFinite(preorderPrice) ||
      preorderPrice < 0)
  ) {
    settingsRedirect(
      "error",
      "Enter a valid preorder price.",
    );
  }

  const admin = createAdminClient();

  if (productId) {
    const productResult = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (!productResult.data) {
      settingsRedirect(
        "error",
        "The selected product is unavailable.",
      );
    }
  }

  const result = await admin
    .from("preorder_popup_settings")
    .upsert({
      id: true,
      is_enabled: isEnabled,
      product_id: productId || null,
      game_title: gameTitle,
      image_url: imageUrl,
      launch_date:
        parsedLaunchDate?.toISOString() ?? null,
      preorder_price: preorderPrice,
      bonus_text: bonusText,
      button_text: buttonText,
    });

  if (result.error) {
    settingsRedirect(
      "error",
      result.error.message,
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/preorder-popup");
  settingsRedirect(
    "success",
    "Preorder popup settings saved.",
  );
}
