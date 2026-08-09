import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSidebar from "../../AdminSidebar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams: Promise<{ q?: string }>;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  invoice_date: string;
  payment_status: string;
  currency: string;
  total: number | string;
};

function formatAmount(amount: number | string, currency: string) {
  return `${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export default async function InvoiceHistoryPage({
  searchParams,
}: HistoryPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");

  const { q = "" } = await searchParams;
  const search = q.trim().slice(0, 100);
  let query = createAdminClient()
    .from("saved_invoices")
    .select(
      "id, invoice_number, customer_name, customer_email, invoice_date, payment_status, currency, total",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) query = query.ilike("invoice_number", `%${search}%`);

  const result = await query;
  if (result.error) {
    throw new Error(`Unable to load invoices: ${result.error.message}`);
  }
  const invoices = (result.data ?? []) as InvoiceRow[];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                Saved records
              </p>
              <h1 className="mt-2 text-3xl font-black">Invoice history</h1>
              <p className="mt-1 text-sm text-slate-500">
                Search and reopen previously saved invoices.
              </p>
            </div>
            <Link
              href="/admin/invoices"
              className="rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-black text-white hover:bg-blue-500"
            >
              Create invoice
            </Link>
          </header>

          <form className="mt-7 flex max-w-2xl gap-3">
            <input
              name="q"
              defaultValue={search}
              placeholder="Search invoice number"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
            />
            <button className="rounded-xl bg-slate-950 px-6 py-3 font-black text-white">
              Search
            </button>
          </form>

          <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {invoices.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-500">
                No invoice found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-5 py-4">Invoice</th>
                      <th className="px-5 py-4">Customer</th>
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4">Amount</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-t border-slate-200">
                        <td className="px-5 py-4 font-black text-blue-600">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold">{invoice.customer_name}</p>
                          <p className="text-xs text-slate-500">
                            {invoice.customer_email}
                          </p>
                        </td>
                        <td className="px-5 py-4">{invoice.invoice_date}</td>
                        <td className="px-5 py-4 font-black">
                          {formatAmount(invoice.total, invoice.currency)}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                            {invoice.payment_status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/admin/invoices/${invoice.id}`}
                            className="font-black text-blue-600 hover:underline"
                          >
                            View invoice
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
