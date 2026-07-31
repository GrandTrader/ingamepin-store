"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
const allowed = new Set(["TEXT", "EMAIL", "NUMBER", "TEXTAREA"]);
export async function saveCustomerInformation(formData: FormData) {
  const id = String(formData.get("id") ?? ""); const path = `/admin/products/${id}/edit/customer-information`; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/admin/login"); const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); if (!access.data) redirect("/admin/login?error=Access denied");
  const labels = formData.getAll("customer_field_label").map((value) => String(value).trim()); const placeholders = formData.getAll("customer_field_placeholder").map((value) => String(value).trim()); const types = formData.getAll("customer_field_type").map((value) => String(value)); const required = new Set(formData.getAll("customer_field_required").map(Number)); if (labels.length > 20 || labels.some((label) => !label || label.length > 80) || placeholders.length !== labels.length || types.length !== labels.length || types.some((type) => !allowed.has(type))) redirect(`${path}?error=${encodeURIComponent("Customer fields are invalid.")}`);
  const admin = createAdminClient(); const remove = await admin.from("product_customer_fields").delete().eq("product_id", id); if (remove.error) redirect(`${path}?error=${encodeURIComponent(remove.error.message)}`); if (labels.length) { const insert = await admin.from("product_customer_fields").insert(labels.map((label, index) => ({ product_id: id, label, placeholder: placeholders[index] || null, field_type: types[index], is_required: required.has(index), sort_order: index }))); if (insert.error) redirect(`${path}?error=${encodeURIComponent(insert.error.message)}`); }
  const update = await admin.from("products").update({ requires_customer_details: labels.length > 0, updated_at: new Date().toISOString() }).eq("id", id); if (update.error) redirect(`${path}?error=${encodeURIComponent(update.error.message)}`); revalidatePath(path); redirect(`${path}?success=${encodeURIComponent("Customer information saved.")}`);
}
