import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";

export async function requireDefinitePlayAdmin() {
  const client = await createClient();
  const {data:{user},error} = await client.auth.getUser();
  if (error || !user) redirect("/admin/login");
  const access = await client.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access%20denied");
  return client;
}
export function validProductId(id: string) {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
}
