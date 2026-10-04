import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const GUEST_PURCHASE_COOKIE = "igp_purchase_session";
export const GUEST_CHALLENGE_COOKIE = "igp_purchase_challenge";
export const purchaseCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const validPurchaseToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export type PurchaseIdentity = { email: string; userId: string | null; source: "account" | "guest" };

export async function purchaseIdentity(): Promise<PurchaseIdentity | null> {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (user?.email && user.email_confirmed_at && !error) {
    return { email: user.email.trim().toLowerCase(), userId: user.id, source: "account" };
  }
  const token = (await cookies()).get(GUEST_PURCHASE_COOKIE)?.value ?? "";
  if (!validPurchaseToken(token)) return null;
  const result = await createAdminClient().from("guest_purchase_sessions").select("email,expires_at").eq("token_hash", tokenHash(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (result.error) throw Error("Unable to verify purchase access.");
  // OTP can verify an unconfirmed account's own email, but grants no account privileges.
  if (user && result.data?.email !== user.email?.trim().toLowerCase()) return null;
  return result.data ? { email: result.data.email, userId: null, source: "guest" } : null;
}

export function ownsPurchase(identity: PurchaseIdentity | null, order: {customer_id?: string | null; customer_email?: string | null}) {
  return Boolean(identity && ((identity.userId && identity.userId === order.customer_id) || identity.email === order.customer_email?.trim().toLowerCase()));
}
