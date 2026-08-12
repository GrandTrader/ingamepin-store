"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UNLIMITED_STOCK_QUANTITY } from "@/lib/product-stock";

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
  return createAdminClient();
}

export async function setProductStockMode(productId: string, formData: FormData) {
  const path = `/admin/products/${productId}/edit/stock`;
  const mode = String(formData.get("stock_mode") ?? "");
  if (mode !== "CODE_INVENTORY" && mode !== "UNLIMITED") {
    redirect(`${path}?error=${encodeURIComponent("Select a valid stock mode.")}`);
  }

  const admin = await requireAdministrator();
  const optionsResult = await admin
    .from("product_options")
    .select("id")
    .eq("product_id", productId);
  if (optionsResult.error) {
    redirect(`${path}?error=${encodeURIComponent(optionsResult.error.message)}`);
  }

  const options = optionsResult.data ?? [];
  if (mode === "UNLIMITED") {
    const optionUpdate = await admin
      .from("product_options")
      .update({ stock_quantity: UNLIMITED_STOCK_QUANTITY, updated_at: new Date().toISOString() })
      .eq("product_id", productId);
    if (optionUpdate.error) {
      redirect(`${path}?error=${encodeURIComponent(optionUpdate.error.message)}`);
    }

    const productUpdate = await admin
      .from("products")
      .update({
        stock_quantity: UNLIMITED_STOCK_QUANTITY,
        delivery_type: "MANUAL",
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);
    if (productUpdate.error) {
      redirect(`${path}?error=${encodeURIComponent(productUpdate.error.message)}`);
    }
  } else {
    let totalStock = 0;
    for (const option of options) {
      const countResult = await admin
        .from("gift_card_codes")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("product_option_id", option.id)
        .eq("status", "AVAILABLE");
      if (countResult.error) {
        redirect(`${path}?error=${encodeURIComponent(countResult.error.message)}`);
      }
      const count = countResult.count ?? 0;
      totalStock += count;
      const optionUpdate = await admin
        .from("product_options")
        .update({ stock_quantity: count, updated_at: new Date().toISOString() })
        .eq("id", option.id)
        .eq("product_id", productId);
      if (optionUpdate.error) {
        redirect(`${path}?error=${encodeURIComponent(optionUpdate.error.message)}`);
      }
    }

    const productUpdate = await admin
      .from("products")
      .update({ stock_quantity: totalStock, updated_at: new Date().toISOString() })
      .eq("id", productId);
    if (productUpdate.error) {
      redirect(`${path}?error=${encodeURIComponent(productUpdate.error.message)}`);
    }
  }

  revalidatePath(path);
  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect(`${path}?success=${encodeURIComponent(mode === "UNLIMITED" ? "Unlimited stock enabled for every denomination. Delivery was set to Manual." : "Voucher/code inventory enabled and stock was synchronized from available codes.")}`);
}
export async function deleteAllUnsoldCodes(productId: string, productOptionId: string, _formData: FormData) {
  const path = `/admin/products/${productId}/edit/stock`; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/admin/login"); const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); if (!access.data) redirect("/admin/login?error=Access denied"); const admin = createAdminClient(); const remove = await admin.from("gift_card_codes").delete().eq("product_id", productId).eq("product_option_id", productOptionId).in("status", ["AVAILABLE", "DISABLED"]); if (remove.error) redirect(`${path}?error=${encodeURIComponent(remove.error.message)}`); await admin.from("product_options").update({ stock_quantity: 0, updated_at: new Date().toISOString() }).eq("id", productOptionId).eq("product_id", productId); const stockResult = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("status", "AVAILABLE"); if (stockResult.error) redirect(`${path}?error=${encodeURIComponent(stockResult.error.message)}`); await admin.from("products").update({ stock_quantity: stockResult.count ?? 0, updated_at: new Date().toISOString() }).eq("id", productId); revalidatePath(path); revalidatePath("/"); redirect(`${path}?success=${encodeURIComponent("Unsold voucher codes deleted for the selected denomination only.")}`);
}
