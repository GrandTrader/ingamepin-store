"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Admin login required.");
  const result = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!result.data) throw new Error("Access denied.");
}

export type CreateBulkApiKeyState = { error?: string; apiKey?: string; partnerName?: string };

export async function createBulkApiKey(
  _previous: CreateBulkApiKeyState,
  formData: FormData
): Promise<CreateBulkApiKeyState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { error: "Enter a valid partner name." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "Enter a valid email address." };

  const apiKey = `igp_live_${randomBytes(36).toString("base64url")}`;
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const result = await createAdminClient().from("bulk_api_clients").insert({
    name,
    contact_email: contactEmail || null,
    key_prefix: `${apiKey.slice(0, 17)}...${apiKey.slice(-4)}`,
    key_hash: keyHash,
  });
  if (result.error) return { error: "Unable to create the API key." };
  revalidatePath("/admin/bulk-api");
  return { apiKey, partnerName: name };
}

export async function revokeBulkApiKey(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await createAdminClient().from("bulk_api_clients").update({ status: "REVOKED", revoked_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/bulk-api");
}
