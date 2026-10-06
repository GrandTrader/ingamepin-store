"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";

export async function businessLogout() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw Error("Unable to sign out. Please try again.");
  redirect("/business/login?success=You%20have%20been%20signed%20out.");
}
