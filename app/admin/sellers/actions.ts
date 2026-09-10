"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSellerAdministrator } from "@/lib/seller-access";
import { sellerVerificationChecks, type SellerApplication } from "@/lib/seller-application";

export async function reviewSellerApplication(form: FormData) {
  const admin = await requireSellerAdministrator();
  const id = String(form.get("seller_id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) redirect("/admin/sellers");
  const fail = (message: string): never => redirect("/admin/sellers/" + id + "?error=" + encodeURIComponent(message));
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("review_note") ?? "").trim();
  if (!["APPROVED", "REJECTED"].includes(decision) || note.length > 2000) fail("Choose a valid decision and keep feedback under 2,000 characters.");
  if (decision === "REJECTED" && !note) fail("Explain why the application needs changes.");
  const db = createAdminClient();
  const result = await db.from("seller_accounts").select("*").eq("id", id).maybeSingle();
  if (result.error || !result.data) fail("Unable to load this application.");
  const seller = result.data as SellerApplication;
  if (seller.status !== "PENDING") fail("Only pending applications can be reviewed.");
  if (decision === "APPROVED" && (sellerVerificationChecks(seller).some(check => !check.complete) || !seller.legal_name?.trim() || !seller.country_code || !seller.phone_number || !seller.submitted_at)) fail("Complete all required verification before approval.");
  const now = new Date().toISOString();
  const update = await db.from("seller_accounts").update({ status: decision, reviewed_by: admin.id, reviewed_at: now, review_note: note || null, updated_at: now }).eq("id", id).eq("status", "PENDING").eq("updated_at", seller.updated_at).select("id").maybeSingle();
  if (update.error || !update.data) fail("The application changed or could not be saved. Refresh before reviewing again.");
  revalidatePath("/admin/sellers"); revalidatePath("/admin/sellers/" + id); revalidatePath("/seller");
  redirect("/admin/sellers/" + id + "?success=Review%20saved");
}
