"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateCustomerPhone(formData: FormData) {
  const countryCode = String(formData.get("country_code") ?? "").trim();
  const localPhone = String(formData.get("phone") ?? "").trim();
  const phone = localPhone ? `${countryCode} ${localPhone}`.trim() : "";
  if (phone && (!/^\+[0-9]{1,4}$/.test(countryCode) || !/^[0-9 ()-]{6,18}$/.test(localPhone))) {
    redirect("/account/profile?error=Enter a valid phone number.");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/account?error=Please sign in to continue.");
  const result = await supabase.from("profiles").update({ phone: phone || null }).eq("id", user.id);
  if (result.error) redirect(`/account/profile?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/account/profile");
  redirect("/account/profile?success=Phone number saved.");
}
