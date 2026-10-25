import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireWupexAdmin() {
  const session = await createClient({ reuseVerifiedUser: true });
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access%20denied");
  return { userId: user.id, db: createAdminClient() };
}
