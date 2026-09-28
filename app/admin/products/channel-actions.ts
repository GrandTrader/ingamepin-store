"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function setProductChannel(
  productId: string,
  channel: "retail" | "business",
  enabled: boolean,
): Promise<{ error?: string }> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId) ||
    !["retail", "business"].includes(channel) ||
    typeof enabled !== "boolean"
  ) return { error: "Invalid product setting." };

  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: "Sign in as an administrator." };
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) return { error: "Administrator access required." };

  const result = await createAdminClient().from("products").update({
    [channel === "retail" ? "retail_enabled" : "business_enabled"]: enabled,
    updated_at: new Date().toISOString(),
  }).eq("id", productId).select("id").single();
  if (result.error) {
    return { error: "Unable to save this setting. Check that the product channels SQL update is installed." };
  }

  updateTag("homepage-store-data");
  updateTag("business-catalogue");
  revalidatePath("/", "layout");
  return {};
}
