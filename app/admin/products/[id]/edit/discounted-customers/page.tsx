import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../../../../AdminSidebar";
import {
  addProductCustomerDiscount,
  removeProductCustomerDiscount,
  updateProductCustomerDiscount,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DiscountedCustomersPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const [productResult, discountsResult, usersResult] = await Promise.all([
    admin.from("products").select("id,name,slug").eq("id", id).maybeSingle(),
    admin.from("customer_product_discounts").select("id,user_id,discount_percent,updated_at").eq("product_id", id).eq("is_active", true).order("updated_at", { ascending: false }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (!productResult.data) notFound();
  if (discountsResult.error || usersResult.error) {
    throw new Error(discountsResult.error?.message ?? usersResult.error?.message ?? "Unable to load discounted customers.");
  }

  const users = new Map(usersResult.data.users.map((customer) => [customer.id, customer]));
  const discounts = discountsResult.data ?? [];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p>
              <h1 className="mt-2 text-3xl font-black">{productResult.data.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{productResult.data.slug}</p>
            </div>
            <Link href="/admin/products" className="h-fit rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">← Product list</Link>
          </header>

          {messages.success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-700">✓ {messages.success}</div>}
          {messages.error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{messages.error}</div>}

          <div className="mt-8"><ProductEditPageTabs productId={id} current="discounted-customers" /></div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black">Add discounted customer</h2>
            <form action={addProductCustomerDiscount} className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end">
              <input type="hidden" name="product_id" value={id} />
              <label className="text-sm font-bold">Customer email<input name="customer_email" type="email" required placeholder="customer@example.com" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" /></label>
              <label className="text-sm font-bold">Discount %<input name="discount_percent" type="number" min="0.01" max="100" step="0.01" required className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" /></label>
              <button className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500">Add customer</button>
            </form>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <h2 className="text-xl font-black">Discounted customers ({discounts.length})</h2>
              <p className="mt-1 text-sm text-slate-500">Update or remove this product&apos;s customer-specific discounts.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Discount</th><th className="px-5 py-4">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {discounts.map((discount) => {
                    const customer = users.get(discount.user_id);
                    const email = customer?.email ?? "Unknown customer";
                    const name = String(customer?.user_metadata?.full_name ?? customer?.user_metadata?.name ?? email.split("@")[0]);
                    return (
                      <tr key={discount.id}>
                        <td className="px-5 py-4"><p className="font-black">{name}</p><p className="mt-1 text-xs text-slate-500">{email}</p></td>
                        <td className="px-5 py-4">
                          <form action={updateProductCustomerDiscount} className="flex items-center gap-2">
                            <input type="hidden" name="product_id" value={id} /><input type="hidden" name="discount_id" value={discount.id} />
                            <input name="discount_percent" type="number" min="0.01" max="100" step="0.01" required defaultValue={Number(discount.discount_percent)} className="w-28 rounded-lg border border-slate-300 px-3 py-2" />
                            <button className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Save</button>
                          </form>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {customer && <Link href={`/admin/customers/${customer.id}`} className="font-bold text-blue-600">View customer</Link>}
                            <form action={removeProductCustomerDiscount}><input type="hidden" name="product_id" value={id} /><input type="hidden" name="discount_id" value={discount.id} /><button className="font-bold text-red-600">Remove</button></form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {discounts.length === 0 && <p className="p-8 text-center text-slate-500">No customers have a discount for this product.</p>}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
