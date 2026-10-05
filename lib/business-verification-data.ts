import "server-only";
import { hasRequiredAdminAssurance } from "./admin-assurance";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessApplication } from "./business-verification";
export async function requireBusinessAdmin() {
  const session=await createClient();
  const {data:{user}}=await session.auth.getUser();
  if(!user) redirect("/admin/login");
  const access=await session.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(access.error || !access.data) redirect("/admin/login?error=Access%20denied");
  if (!(await hasRequiredAdminAssurance(session))) redirect("/admin/login/verify");
  return user;
}
export async function businessApplication(userId:string) {
  const r=await createAdminClient().from("business_kyb").select("*").eq("user_id",userId).maybeSingle();
  if(r.error) throw Error("Business verification is not available right now. Please contact support.");
  return r.data as BusinessApplication|null;
}
