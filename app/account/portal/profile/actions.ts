"use server";
import { revalidatePath } from "next/cache";
import { portalCustomer } from "@/lib/business-portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBusinessProfileCompletion } from "@/lib/admin-business-profile";
export async function completeBusinessProfile(form: FormData) {
  const {user, application} = await portalCustomer();
  try {
    const patch = parseBusinessProfileCompletion(form, application.details);
    const result = await createAdminClient().rpc("complete_business_profile", {p_user: user.id, p_details: patch});
    if (result.error) return {error: result.error.code === "P0001" ? result.error.message : "Unable to save business details. Please contact support."};
    for (const path of ["/account/portal/profile", "/account/profile", "/account/business", "/account/portal/business", "/admin/business-verification", `/admin/business-verification/${user.id}`]) revalidatePath(path);
    return {success: "Business details saved and locked. Contact support if a correction is needed."};
  } catch (error) {return {error: error instanceof Error ? error.message : "Unable to save business details."};}
}
