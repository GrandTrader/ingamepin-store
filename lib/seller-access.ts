import "server-only";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSellerAdministrator() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access%20denied");
  if (!(await hasRequiredAdminAssurance(session))) redirect("/admin/login/verify");
  return user;
}
