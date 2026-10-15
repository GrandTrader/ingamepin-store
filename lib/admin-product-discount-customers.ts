import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// A product usually has only a few discounted customers. Do not download the
// first 1,000 accounts every time its editor tab is opened.
export async function getProductDiscountCustomers(admin: SupabaseClient, userIds: string[]) {
  const ids = [...new Set(userIds)];
  const users = new Map<string, User>();
  for (let index = 0; index < ids.length; index += 6) {
    const results = await Promise.all(ids.slice(index, index + 6).map(async id => {
      const result = await admin.auth.admin.getUserById(id);
      if (result.error && result.error.status !== 404) throw new Error("Unable to load discounted customer details. Please try again.");
      return result.data.user;
    }));
    for (const user of results) if (user) users.set(user.id, user);
  }
  return users;
}
