import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient as createAuthClient } from "./auth-server";
import { getPasswordExpiry } from "@/lib/password-expiry";

// Guard server actions too: a caller can submit an action from another page.
// Authentication/recovery flows explicitly use auth-server instead.
export const createClient = cache(async () => {
  const client = await createAuthClient();
  const getUser = client.auth.getUser.bind(client.auth);
  const verifyUser = async (...args: Parameters<typeof getUser>) => {
    const result = await getUser(...args);
    if (!result.error && result.data.user) {
      const expiry = await getPasswordExpiry(client);
      if (expiry.required) redirect("/account/renew-password");
    }
    return result;
  };
  // React deduplicates only within this render. Actions and route handlers still
  // execute every verification; proxy checks and recovery flows are unchanged.
  const verifyRenderUser = cache(() => verifyUser());
  client.auth.getUser = (...args: Parameters<typeof getUser>) =>
    args[0] ? verifyUser(...args) : verifyRenderUser();
  return client;
});
