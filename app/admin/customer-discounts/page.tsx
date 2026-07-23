import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { removeCustomerDiscounts, saveCustomerDiscounts } from "./actions";

export const dynamic = "force-dynamic";

export default async function CustomerDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; success?: string; error?: string }>;
}) {
  const { email: rawEmail = "", success, error } = await searchParams;
  const email = rawEmail.trim().toLowerCase();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const adminCheck = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminCheck.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const productsResult = await admin
    .from("products")
    .select("id, name, slug, product_type")
    .eq("status", "ACTIVE")
    .order("name", { ascending: true });

  if (productsResult.error) throw new Error(productsResult.error.message);

  let customer: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
  let existingDiscounts: Array<{ product_id: string; discount_percent: number | string }> = [];

  if (email) {
    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    customer = usersResult.data.users.find((entry) => entry.email?.toLowerCase() === email) ?? null;

    if (customer) {
      const discountResult = await admin
        .from("customer_product_discounts")
        .select("product_id, discount_percent")
        .eq("user_id", customer.id)
        .eq("is_active", true);

      if (discountResult.error) throw new Error(discountResult.error.message);
      existingDiscounts = discountResult.data ?? [];
    }
  }

  const discountsByProduct = new Map(
    existingDiscounts.map((row) => [
      row.product_id,
      Number(row.discount_percent),
    ]),
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <AdminSidebar />
      <section className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-black">Customer Discounts</h1>
          <p className="mt-2 text-slate-500">Assign a percentage discount to selected products for a registered customer.</p>

          {success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</p>}
          {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

          <form method="get" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <label className="block text-sm font-bold" htmlFor="customer-email">Registered customer email</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input id="customer-email" name="email" type="email" required defaultValue={email} placeholder="customer@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500">Find Customer</button>
            </div>
          </form>

          {email && !customer && (
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">No registered customer was found for {email}.</p>
          )}

          {customer && (
            <form action={saveCustomerDiscounts} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <input type="hidden" name="customer_email" value={email} />
              <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
                <div><p className="text-sm text-slate-500">Customer</p><p className="mt-1 font-black">{customer.email}</p></div>
                <p className="text-sm text-slate-500">Set a separate percentage for every selected product.</p>
              </div>

              <div className="mt-5 flex items-center justify-between gap-4"><h2 className="text-xl font-black">Choose products</h2><span className="text-sm text-slate-500">{productsResult.data.length} active products</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {productsResult.data.map((product) => (
                  <div key={product.id} className="rounded-xl border border-slate-200 p-4 hover:border-blue-400">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" name="product_ids" value={product.id} defaultChecked={discountsByProduct.has(product.id)} className="mt-1 h-4 w-4" />
                      <span><span className="block font-bold">{product.name}</span><span className="mt-1 block text-xs text-slate-500">{product.product_type.replaceAll("_", " ")}</span></span>
                    </label>
                    <label className="mt-4 block text-sm font-bold">
                      Discount percentage
                      <span className="relative mt-2 block">
                        <input name={`discount_percent_${product.id}`} type="number" min="0.01" max="100" step="0.01" defaultValue={discountsByProduct.get(product.id) ?? 1} className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-9 font-normal outline-none focus:border-blue-500" />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button type="submit" className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500">Save Customer Discount</button>
                {existingDiscounts.length > 0 && <button type="submit" formAction={removeCustomerDiscounts} formNoValidate className="rounded-xl border border-red-200 px-6 py-3 font-bold text-red-600 hover:bg-red-50">Remove All Discounts</button>}
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
