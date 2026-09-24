import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "../../AdminSidebar";
import { createClient } from "@/lib/supabase/admin-session";
import FullProductImportForm from "./FullProductImportForm";

export const dynamic = "force-dynamic";

export default async function ImportProductPage() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access denied");
  const categories = await session.from("categories").select("id, name, slug, category_type").eq("is_active", true).order("name");

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Link href="/admin/products" className="text-sm font-bold text-blue-600">← Product list</Link>
          <h1 className="mt-4 text-2xl font-black">Import full product</h1>
          <p className="mt-2 text-slate-600">Upload one CSV with English and Russian details, denominations and selling prices.</p>
          {categories.error ? (
            <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">Unable to load categories. Refresh this page to try again.</p>
          ) : <FullProductImportForm categories={categories.data ?? []} />}
        </main>
      </div>
    </div>
  );
}

