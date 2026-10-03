"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { portalCustomer } from "@/lib/business-portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiAllowedIps } from "@/lib/business-api-input";

export type ApiKeyState = { error?: string; message?: string; secret?: string };

export async function createBusinessKey(_state: ApiKeyState, form: FormData): Promise<ApiKeyState> {
  const { user } = await portalCustomer();
  try {
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2 || name.length > 80) throw Error("Use a key name between 2 and 80 characters.");
    const ips = apiAllowedIps(String(form.get("ips") ?? ""));
    const days = Number(form.get("days"));
    if (![30,90,365].includes(days)) throw Error("Choose a valid expiry.");
    const secret = `igp_b2b_${randomBytes(32).toString("base64url")}`;
    const result = await createAdminClient().rpc("create_business_api_key", {
      p_user: user.id, p_name: name, p_hash: createHash("sha256").update(secret).digest("hex"),
      p_prefix: `${secret.slice(0,16)}…${secret.slice(-4)}`, p_ips: ips,
      p_write: form.get("can_order") === "on", p_expires: new Date(Date.now()+days*86400000).toISOString(),
    });
    if (result.error) return { error: result.error.code === "P0001" ? result.error.message : "Unable to create the key. The business API database update may be required." };
    revalidatePath("/account/portal/api-access");
    return { secret, message: "Key created. Copy it now; it will not be shown again." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to create key." }; }
}

export async function updateBusinessKey(_state: ApiKeyState, form: FormData): Promise<ApiKeyState> {
  const { user } = await portalCustomer();
  try {
    const id = String(form.get("id") ?? "");
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error("Invalid key.");
    const revoke = form.get("operation") === "revoke";
    const changes = revoke ? { revoked_at: new Date().toISOString() } : {
      allowed_ips: apiAllowedIps(String(form.get("ips") ?? "")), can_order: form.get("can_order") === "on",
    };
    const result = await createAdminClient().from("business_api_keys").update(changes).eq("id",id).eq("user_id",user.id).is("revoked_at",null).select("id").maybeSingle();
    if (result.error || !result.data) throw Error("Unable to update this key. Reload and try again.");
    revalidatePath("/account/portal/api-access");
    return { message: revoke ? "API key revoked." : "API access updated." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to update key." }; }
}
