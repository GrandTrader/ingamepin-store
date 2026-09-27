import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
export async function requireGiftPortAdmin() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/admin/login");
  const access = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access%20denied");
}
