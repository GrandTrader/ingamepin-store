import "server-only";
import { redirect } from "next/navigation";
import { createClient as createSessionClient } from "./server";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";

// Server Actions can be invoked outside their page, so middleware is not enough.
export async function createClient({ reuseVerifiedUser = false }: { reuseVerifiedUser?: boolean } = {}) {
  const client = await createSessionClient();
  const verified = await client.auth.getUser();
  const { data: { user }, error } = verified;
  if (error || !user) redirect("/admin/login");
  if (!(await hasRequiredAdminAssurance(client))) redirect("/admin/login/verify");
  if (reuseVerifiedUser) {
    // Scoped to this mutation's client instance, never shared between requests.
    // Product mutations do not change the authentication session.
    const getUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = async (...args: Parameters<typeof getUser>) =>
      args.length ? getUser(...args) : verified;
  }
  return client;
}
