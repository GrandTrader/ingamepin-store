"use server";
import { createClient } from "@/lib/supabase/server";

export async function recordAffiliateLinkCopy(productId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return {recorded:false};
  const db = await createClient();
  const {data:{user},error} = await db.auth.getUser();
  if (error || !user?.email_confirmed_at) return {recorded:false};
  // The database derives the promoter from the signed-in user, never from the browser.
  const result = await db.rpc("record_affiliate_link_copy", {p_product_id:productId});
  return {recorded:!result.error};
}
