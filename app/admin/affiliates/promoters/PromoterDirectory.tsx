import Link from "next/link";
import { redirect } from "next/navigation";

import { loadAffiliatePromoters } from "@/lib/admin-affiliate-promoters";
import { promoterDirectoryPath, type PromoterView } from "@/lib/affiliate-promoters";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../AdminSidebar";
import PromoterList from "./PromoterList";

export default async function PromoterDirectory({ view, searchParams }: {
  view: PromoterView;
  searchParams: Promise<{ success?: string; error?: string; q?: string }>;
}) {
  const { success, error, q } = await searchParams;
  const approved = view === "approved";
  const title = approved ? "Approved Promoters" : "Affiliate Applications";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const accessResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!accessResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const accounts = await loadAffiliatePromoters(view);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                Affiliate program
              </p>
              <h1 className="mt-2 text-3xl font-black">{title}</h1>
              <p className="mt-2 text-sm text-slate-500">
                {approved ? "Find approved promoters by email and manage their status and commission." : "Review applications and manage pending, rejected, or suspended promoters."}
              </p>
            </div>

            <Link
              href="/admin/affiliates"
              className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold"
            >
              ← Affiliate Settings
            </Link>
          </header>

          <nav aria-label="Promoter directory" className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            {(["applications", "approved"] as const).map(tab => <Link key={tab} href={promoterDirectoryPath(tab)} aria-current={view === tab ? "page" : undefined} className={`rounded-lg px-4 py-3 text-sm font-bold ${view === tab ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{tab === "approved" ? "Approved Promoters" : "Affiliate Applications"}</Link>)}
          </nav>

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <PromoterList accounts={accounts} view={view} initialSearch={typeof q === "string" ? q.slice(0, 254) : ""} />
        </main>
      </div>
    </div>
  );
}
