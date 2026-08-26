import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import { revokeBulkApiKey } from "./actions";
import BulkApiKeyCreator from "./BulkApiKeyCreator";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BulkApiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const adminUser = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminUser.data) redirect("/admin/login?error=Access denied");

  const clients = await createAdminClient()
    .from("bulk_api_clients")
    .select("id, name, contact_email, key_prefix, status, last_used_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">Partner access</p>
          <h1 className="mt-2 text-3xl font-black">Bulk API</h1>
          <p className="mt-2 text-sm text-slate-500">Create a separate secure key for each approved bulk customer.</p>

          <section className="mt-8 max-w-4xl rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <h2 className="text-xl font-black">Create customer API key</h2>
            <BulkApiKeyCreator />
          </section>

          <section className="mt-6 max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Customer keys</h2></div>
            <div className="divide-y divide-slate-200">
              {(clients.data ?? []).map((client) => (
                <div key={client.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black">{client.name}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${client.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{client.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{client.contact_email || "No contact email"} · {client.key_prefix}</p>
                    <p className="mt-1 text-xs text-slate-400">Last used: {client.last_used_at ? new Date(client.last_used_at).toLocaleString("en-IN") : "Never"}</p>
                  </div>
                  {client.status === "ACTIVE" && (
                    <form action={revokeBulkApiKey}>
                      <input type="hidden" name="id" value={client.id} />
                      <button className="rounded-xl border border-red-300 px-4 py-2 text-sm font-black text-red-600">Revoke key</button>
                    </form>
                  )}
                </div>
              ))}
              {(clients.data ?? []).length === 0 && <p className="p-5 text-sm text-slate-500">No customer API keys yet.</p>}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
