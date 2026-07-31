"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function saveDeliverySettings(formData: FormData) {
  const id = String(formData.get("id") ?? ""); const path = `/admin/products/${id}/edit/delivery`; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/admin/login"); const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); if (!access.data) redirect("/admin/login?error=Access denied");
  const deliveryType = String(formData.get("delivery_type") ?? ""); if (deliveryType !== "MANUAL" && deliveryType !== "AUTOMATIC") redirect(`${path}?error=Invalid delivery type`); const deliveryInstructions = String(formData.get("delivery_instructions") ?? "").trim(); const isBulk = deliveryType === "MANUAL" && formData.get("is_bulk_order") === "true"; const bulkInstructions = String(formData.get("bulk_delivery_instructions") ?? "").trim(); if (isBulk && bulkInstructions.length < 2) redirect(`${path}?error=${encodeURIComponent("Enter bulk delivery instructions.")}`);
  const result = await createAdminClient().from("products").update({ delivery_type: deliveryType, delivery_instructions: deliveryInstructions || null, is_bulk_order: isBulk, bulk_delivery_instructions: isBulk ? bulkInstructions : null, updated_at: new Date().toISOString() }).eq("id", id); if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`); revalidatePath(path); revalidatePath("/"); redirect(`${path}?success=${encodeURIComponent("Delivery settings saved.")}`);
}
