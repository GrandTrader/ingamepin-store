import { redirect } from "next/navigation";
import { createClient as createAuthClient } from "./auth-server";
import { getPasswordExpiry } from "@/lib/password-expiry";

// Guard server actions too: a caller can submit an action from another page.
// Authentication/recovery flows explicitly use auth-server instead.
export async function createClient() {
  const client = await createAuthClient();
  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = async (...args: Parameters<typeof getUser>) => {
    const result = await getUser(...args);
    if (!result.error && result.data.user) {
      const expiry = await getPasswordExpiry(client);
      if (expiry.required) redirect("/account/renew-password");
    }
    return result;
  };
  return client;
}
