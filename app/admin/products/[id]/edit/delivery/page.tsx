import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { isUnlimitedStock } from "@/lib/product-stock";
import { createClient } from "@/lib/supabase/server";
import { saveDeliverySettings } from "./actions";
import DeliveryOrderModeEditor from "./DeliveryOrderModeEditor";

export const dynamic = "force-dynamic";

export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const { success, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const result = await supabase
    .from("products")
    .select("id, name, slug, delivery_type, delivery_instructions, is_bulk_order, bulk_delivery_instructions, stock_quantity")
    .eq("id", id)
    .maybeSingle();
  if (!result.data) notFound();
  const product = result.data;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p>
              <h1 className="mt-2 text-3xl font-black">{product.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{product.slug}</p>
            </div>
            <Link href="/admin/products" className="h-fit rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">← Product list</Link>
          </header>
          {success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}
          {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
          <div className="mt-8"><ProductEditPageTabs productId={id} current="delivery" /></div>
          <form action={saveDeliverySettings} className="mt-6 grid gap-6">
            <input type="hidden" name="id" value={id} />
            <section className="rounded-2xl border border-slate-200 p-5 shadow-sm sm:p-6">
              <DeliveryOrderModeEditor
                deliveryType={product.delivery_type as "AUTOMATIC" | "MANUAL"}
                instructions={product.delivery_instructions ?? ""}
                isBulk={product.is_bulk_order}
                bulkInstructions={product.bulk_delivery_instructions ?? ""}
                isUnlimitedStock={isUnlimitedStock(product.stock_quantity)}
              />
            </section>
            <div className="flex justify-end"><button className="admin-save-action rounded-xl px-7 py-3 font-black transition">Save Delivery</button></div>
          </form>
        </main>
      </div>
    </div>
  );
}
