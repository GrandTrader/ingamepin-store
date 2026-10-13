"use server";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-session";
import { prepareCustomerFieldsSave, readCustomerFields } from "@/lib/product-customer-fields-save";

export async function saveCustomerInformation(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const path = `/admin/products/${id}/edit/customer-information`;
  const supabase = await createClient({ reuseVerifiedUser: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");
  const admin = createAdminClient();
  try {
    const fields = readCustomerFields(formData);
    const save = await prepareCustomerFieldsSave(admin, id, fields);
    await save();
    const update = await admin.from("products").update({ requires_customer_details: fields.length > 0, updated_at: new Date().toISOString() }).eq("id", id);
    if (update.error) throw new Error("Customer information settings could not be saved.");
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Customer information could not be saved.")}`);
  }
  updateTag("homepage-store-data");
  revalidatePath(path);
  revalidatePath(`/admin/products/${id}/edit/supplier`);
  redirect(`${path}?success=${encodeURIComponent("Customer information saved.")}`);
}
