"use server";

import { headers } from "next/headers";
import { sellerSubmissionIp } from "@/lib/seller-submission-ip";
import { validateSellerPhone } from "@/lib/seller-phone";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import countries from "i18n-iso-countries";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELLER_DECLARATION_VERSION } from "@/lib/seller-application";

export async function submitSellerApplication(_previous: { error: string }, form: FormData): Promise<{ error: string }> {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user?.email) return { error: "Sign in with your customer account before applying." };
  if (!user.email_confirmed_at) return { error: "Verify your account email before submitting your seller application." };
  const username = String(form.get("username") ?? "").trim();
  const firstName = String(form.get("first_name") ?? "").trim();
  const surname = String(form.get("surname") ?? "").trim();
  const legalName = `${firstName} ${surname}`;
  const country = String(form.get("country_code") ?? "").trim().toUpperCase();
  const phone = validateSellerPhone(String(form.get("phone_number") ?? "").trim(), String(form.get("phone_country") ?? ""));
  const address = {
    address_line1: String(form.get("address_line1") ?? "").trim(),
    address_line2: String(form.get("address_line2") ?? "").trim(),
    city: String(form.get("city") ?? "").trim(),
    district: String(form.get("district") ?? "").trim(),
    state_region: String(form.get("state_region") ?? "").trim(),
    postal_code: String(form.get("postal_code") ?? "").trim(),
  };
  if (!address.address_line1 || !address.city || !address.state_region) return { error: "Enter your address, city and state / province / region." };
  if (address.address_line1.length > 200 || address.address_line2.length > 200 || address.city.length > 100 || address.district.length > 100 || address.state_region.length > 100 || address.postal_code.length > 20) return { error: "Please shorten the address fields to the allowed length." };
  if (country === "IN" && !/^[1-9][0-9]{5}$/.test(address.postal_code)) return { error: "Enter a valid 6-digit Indian PIN code." };
  const marketplace = String(form.get("marketplace") ?? "");
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) return { error: "Username must be 3–30 letters, numbers or underscores." };
  if (!firstName || !surname || firstName.length > 75 || surname.length > 75) return { error: "Enter your name and surname (up to 75 characters each)." };
  if (!/^[A-Z]{2}$/.test(country) || !countries.isValid(country)) return { error: "Select your country." };
  if (!phone) return { error: "Select the calling country and enter a valid mobile number without the calling code." };
  if (!["YES", "NO"].includes(marketplace)) return { error: "Complete the marketplace selection." };
  if (form.get("declaration") !== "accepted") return { error: "Accept the seller declaration to submit your application." };
  const submissionIp = sellerSubmissionIp(await headers(), process.env.VERCEL === "1");
  const db = createAdminClient();
  const existing = await db.from("seller_accounts").select("id,status,updated_at,marketplace_proof_path").eq("user_id", user.id).maybeSingle();
  if (existing.error) return { error: "Unable to load your application. Please try again." };
  if (existing.data && !["DRAFT", "REJECTED"].includes(existing.data.status)) return { error: "Your application is already submitted. Contact support if your details need changing." };
  let proofPath: string | null = null;
  if (marketplace === "YES") {
    const proof = form.get("marketplace_proof");
    if (!(proof instanceof File) || proof.size === 0 || proof.size > 5 * 1024 * 1024) return { error: "Upload marketplace proof as a PDF, JPG or PNG up to 5 MB." };
    const bytes = Buffer.from(await proof.arrayBuffer());
    const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : null;
    if (!mime || proof.type !== mime) return { error: "Proof must be a valid PDF, JPG or PNG file." };
    proofPath = user.id + "/" + randomUUID();
    const upload = await db.storage.from("seller-marketplace-proofs").upload(proofPath, bytes, { contentType: mime, upsert: false });
    if (upload.error) return { error: "Could not securely upload proof. Please try again or contact support." };
  }
  const now = new Date().toISOString();
  const data = {
    submission_ip: submissionIp, ...address, username, first_name: firstName, surname, marketplace_proof_path: proofPath, legal_name: legalName, country_code: country, phone_number: phone,
    sells_on_other_marketplaces: marketplace === "YES",
    status: "PENDING", declaration_version: SELLER_DECLARATION_VERSION, declaration_accepted_at: now,
    email_verified_at: user.email_confirmed_at ?? null,
    didit_face_score: null, didit_environment: null,
    identity_verified_at: null, physical_id_verified_at: null, face_liveness_verified_at: null,
    marketplace_statement_verified_at: null, verification_provider: null, verification_reference: null,
    reviewed_at: null, reviewed_by: null, review_note: null, submitted_at: now, updated_at: now,
  };
  const result = existing.data
    ? await db.from("seller_accounts").update(data).eq("id", existing.data.id).eq("user_id", user.id).eq("status", existing.data.status).eq("updated_at", existing.data.updated_at).select("id").maybeSingle()
    : await db.from("seller_accounts").insert({ ...data, user_id: user.id }).select("id").single();
  if ((result.error || !result.data) && proofPath) await db.storage.from("seller-marketplace-proofs").remove([proofPath]);
  if (result.error?.code === "23505") return { error: "This username is already in use, or your application was just submitted. Refresh and try again." };
  if (result.error || !result.data) return { error: "Unable to save the application. Refresh and try again." };
  if (existing.data?.marketplace_proof_path) await db.storage.from("seller-marketplace-proofs").remove([existing.data.marketplace_proof_path]);
  revalidatePath("/seller"); revalidatePath("/admin/sellers");
  redirect("/seller?submitted=1");
}
