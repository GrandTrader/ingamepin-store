"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function deleteAllUnsoldCodes(productId: string, _formData: FormData) {
  const path = `/admin/products/${productId}/edit/stock`; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/admin/login"); const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); if (!access.data) redirect("/admin/login?error=Access denied"); const admin = createAdminClient(); const remove = await admin.from("gift_card_codes").delete().eq("product_id", productId).in("status", ["AVAILABLE", "DISABLED"]); if (remove.error) redirect(`${path}?error=${encodeURIComponent(remove.error.message)}`); await admin.from("product_options").update({ stock_quantity: 0, updated_at: new Date().toISOString() }).eq("product_id", productId).eq("is_custom_value", false); await admin.from("products").update({ stock_quantity: 0, updated_at: new Date().toISOString() }).eq("id", productId); revalidatePath(path); revalidatePath("/"); redirect(`${path}?success=${encodeURIComponent("All unsold voucher codes deleted.")}`);
}
