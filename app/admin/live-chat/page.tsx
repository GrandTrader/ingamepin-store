import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import LiveChatInbox from "./LiveChatInbox";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLiveChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const check = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!check.data) redirect("/admin/login?error=Access denied");

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 lg:flex">
      <AdminSidebar />
      <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <LiveChatInbox />
      </section>
    </main>
  );
}


