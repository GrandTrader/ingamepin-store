"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function saveVisibility(formData: FormData) {
  const id = String(formData.get("id") ?? ""); const path = `/admin/products/${id}/edit/visibility`; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/admin/login"); const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); if (!access.data) redirect("/admin/login?error=Access denied"); const status = String(formData.get("status") ?? ""); if (!new Set(["ACTIVE", "INACTIVE", "DRAFT"]).has(status)) redirect(`${path}?error=Invalid status`); const result = await createAdminClient().from("products").update({ status, is_featured: formData.get("is_featured") === "on", updated_at: new Date().toISOString() }).eq("id", id); if (result.error) redirect(`${path}?error=${encodeURIComponent(result.error.message)}`); revalidatePath(path); revalidatePath("/"); revalidatePath("/products"); redirect(`${path}?success=${encodeURIComponent("Visibility saved.")}`);
}
