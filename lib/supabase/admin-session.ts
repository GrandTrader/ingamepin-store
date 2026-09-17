import "server-only";
import { redirect } from "next/navigation";
import { createClient as createSessionClient } from "./server";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";

// Server Actions can be invoked outside their page, so middleware is not enough.
export async function createClient() {
  const client = await createSessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/admin/login");
  if (!(await hasRequiredAdminAssurance(client))) redirect("/admin/login/verify");
  return client;
}
