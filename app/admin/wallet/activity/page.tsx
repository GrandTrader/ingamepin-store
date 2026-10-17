import Link from "next/link";
import Form from "next/form";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateBoundary, portalDate, portalPage } from "@/lib/business-portal";
import { isReceiptId } from "@/lib/wallet-receipt";
import AdminSidebar from "../../AdminSidebar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer wallet activity | InGamePin", robots: { index: false, follow: false } };

const PAGE_SIZE = 25;
type Params = { [key: string]: string | string[] | undefined };
type Filters = { customer: string; from: string; to: string; type: string; reference: string; page: number };
type Transaction = {
  id: string; user_id: string; transaction_type: string; amount: number | string;
  balance_before: number | string | null; balance_after: number | string | null;
  description: string | null; reference_id: string | null; created_at: string;
};
type Customer = { id: string; email?: string; user_metadata?: { full_name?: unknown; name?: unknown } };
const stringValue = (value: Params[string]) => typeof value === "string" ? value.trim() : "";
const money = (value: number | string | null, currency: string) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
const customerName = (customer: Customer) => String(customer.user_metadata?.full_name ?? customer.user_metadata?.name ?? customer.email ?? "Customer");
function activityUrl(filters: Partial<Filters> = {}) {
  const query = new URLSearchParams();
  for (const key of ["customer", "from", "to", "type", "reference"] as const) if (filters[key]) query.set(key, filters[key]);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  return "/admin/wallet/activity" + (query.size ? "?" + query.toString() : "");
}

export default async function WalletActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await createClient({ reuseVerifiedUser: true });
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access denied");

  const params = await searchParams;
  // Invalid customer filters must never silently become an all-customer query.
  if (params.customer !== undefined && (typeof params.customer !== "string" || !isReceiptId(params.customer))) notFound();
  const filters: Filters = {
    customer: stringValue(params.customer).toLowerCase(), from: stringValue(params.from), to: stringValue(params.to),
    type: ["CREDIT", "DEBIT"].includes(stringValue(params.type)) ? stringValue(params.type) : "",
    reference: stringValue(params.reference).slice(0, 150), page: portalPage(stringValue(params.page)),
  };
  const start = dateBoundary(filters.from), end = dateBoundary(filters.to, true);
  const filterError = (filters.from && !start) || (filters.to && !end)
    ? "Choose valid dates."
    : start && end && start >= end ? "The end date must be on or after the start date." : "";
  const admin = createAdminClient();
  let selectedCustomer: Customer | null = null;
  if (filters.customer) {
    const result = await admin.auth.admin.getUserById(filters.customer);
    if (result.error?.status === 404 || (!result.error && !result.data.user)) notFound();
    if (result.error) throw new Error("Unable to load this customer. Please try again.");
    selectedCustomer = result.data.user;
  }

  let transactions: Transaction[] = [], count = 0;
  if (!filterError) {
    let query = admin.from("wallet_transactions")
      .select("id,user_id,transaction_type,amount,balance_before,balance_after,description,reference_id,created_at", { count: "exact" });
    if (filters.customer) query = query.eq("user_id", filters.customer);
    if (start) query = query.gte("created_at", start);
    if (end) query = query.lt("created_at", end);
    if (filters.type) query = query.eq("transaction_type", filters.type);
    if (filters.reference) query = query.ilike("reference_id", "%" + filters.reference.replace(/[\\%_]/g, "\\$&") + "%");
    const offset = (filters.page - 1) * PAGE_SIZE;
    const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (result.error || result.count === null) throw new Error("Unable to load wallet activity. Please try again.");
    transactions = (result.data ?? []) as Transaction[];
    count = result.count;
    const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
    if (filters.page > lastPage) redirect(activityUrl({ ...filters, page: lastPage }));
  }

  const userIds = [...new Set([...transactions.map(item => item.user_id), ...(filters.customer ? [filters.customer] : [])])];
  const [wallets, identities] = await Promise.all([
    userIds.length ? admin.from("customer_wallets").select("user_id,balance,currency").in("user_id", userIds) : { data: [], error: null },
    Promise.all(userIds.map(async id => {
      if (selectedCustomer?.id === id) return [id, selectedCustomer] as const;
      const result = await admin.auth.admin.getUserById(id);
      return [id, result.error ? null : result.data.user] as const;
    })),
  ]);
  if (wallets.error) throw new Error("Unable to load wallet balances. Please try again.");
  const customers = new Map(identities);
  const walletByUser = new Map((wallets.data ?? []).map(wallet => [wallet.user_id, wallet]));
  const selectedWallet = walletByUser.get(filters.customer);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const fieldClass = "mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";
  const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50";
  const cellClass = "min-w-0 max-xl:p-0! xl:px-3 xl:py-4 xl:align-top";
  const labelClass = "mb-1 block text-xs text-slate-500 xl:hidden";

  return <div className="min-h-screen bg-slate-100 text-slate-950 md:flex">
    <AdminSidebar />
    <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href={filters.customer ? "/admin/customers/" + filters.customer : "/admin/customers"} prefetch={false} className="text-sm font-bold text-blue-600">← {filters.customer ? "Customer profile" : "Customers"}</Link>
        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black sm:text-3xl">Wallet activity</h1>
            <p className="mt-1 break-words font-bold">{selectedCustomer ? customerName(selectedCustomer) : "All customers"}</p>
            {selectedCustomer && <p className="break-all text-sm text-slate-500">{selectedCustomer.email}</p>}
            <p className="mt-2 text-sm text-slate-500">Top-ups, purchases, refunds and adjustments. Dates are shown in India time (IST).</p>
          </div>
          {selectedCustomer && <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">Current wallet balance</p><p className="mt-1 text-xl font-black">{money(selectedWallet?.balance ?? 0, selectedWallet?.currency ?? "USD")}</p></div>}
        </header>
        <nav aria-label="Wallet views" className="mt-4 flex flex-wrap gap-2">
          {filters.customer && <Link href={activityUrl({ ...filters, customer: "", page: 1 })} prefetch={false} className={buttonClass}>All customers</Link>}
          <Link href="/admin/wallet" prefetch={false} className={buttonClass}>Top-up requests</Link>
        </nav>
        <Form key={activityUrl(filters)} action="/admin/wallet/activity" prefetch={false} className="mt-5 grid grid-cols-2 items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:grid-cols-4">
          {filters.customer && <input type="hidden" name="customer" value={filters.customer} />}
          <label className="min-w-0 text-xs font-bold">From (IST)<input type="date" name="from" defaultValue={filters.from} className={fieldClass} /></label>
          <label className="min-w-0 text-xs font-bold">To (IST)<input type="date" name="to" defaultValue={filters.to} className={fieldClass} /></label>
          <div className="min-w-0 text-xs font-bold"><label htmlFor="wallet-activity-type">Activity type</label><select id="wallet-activity-type" name="type" defaultValue={filters.type} className={fieldClass}><option value="">All activity</option><option value="CREDIT">Money added (credit)</option><option value="DEBIT">Money used (debit)</option></select></div>
          <label className="min-w-0 text-xs font-bold">Reference<input name="reference" placeholder="Order / payment reference" maxLength={150} defaultValue={filters.reference} className={fieldClass} /></label>
          <div className="col-span-2 flex gap-2 lg:col-span-4"><button className="min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Apply filters</button><Link href={activityUrl({ customer: filters.customer })} prefetch={false} className={buttonClass}>Reset</Link></div>
        </Form>
        {filterError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{filterError}</p> : <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <p>{count ? ((filters.page - 1) * PAGE_SIZE + 1).toLocaleString() + "–" + Math.min(filters.page * PAGE_SIZE, count).toLocaleString() + " of " + count.toLocaleString() + " activities" : "0 activities"}</p>
            {identities.some(([, customer]) => !customer) && <p>Some customer details are temporarily unavailable.</p>}
          </div>
          <section aria-label="Wallet transactions" className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="block w-full text-left text-sm xl:table">
              <thead className="hidden bg-slate-50 text-xs text-slate-500 xl:table-header-group"><tr>{["Date (IST)", "Customer", "Activity", "Amount / Type", "Before", "After", "Reference", "Receipt"].map(label => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead>
              <tbody className="block divide-y divide-slate-200 xl:table-row-group">
                {transactions.map(item => {
                  const customer = customers.get(item.user_id), currency = walletByUser.get(item.user_id)?.currency ?? "USD";
                  const credit = item.transaction_type === "CREDIT", debit = item.transaction_type === "DEBIT";
                  return <tr key={item.id} className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 xl:table-row xl:p-0">
                    <td className={cellClass}><span className={labelClass}>Date (IST)</span>{portalDate(item.created_at)}</td>
                    <td className={cellClass + " [overflow-wrap:anywhere]"}><span className={labelClass}>Customer</span><Link href={activityUrl({ customer: item.user_id })} prefetch={false} className="font-bold text-blue-600 hover:underline">{customer ? customerName(customer) : "Customer"}</Link><p className="mt-1 text-xs text-slate-500">{customer?.email ?? item.user_id}</p></td>
                    <td className={cellClass + " [overflow-wrap:anywhere]"}><span className={labelClass}>Activity</span>{item.description || "Wallet transaction"}</td>
                    <td className={cellClass}><span className={labelClass}>Amount / Type</span><p className={"font-black " + (credit ? "text-emerald-700" : debit ? "text-red-700" : "")}>{credit ? "+" : debit ? "−" : ""}{money(item.amount, currency)}</p><p className="mt-1 text-xs text-slate-500">{credit ? "Credit" : debit ? "Debit" : item.transaction_type}</p></td>
                    <td className={cellClass}><span className={labelClass}>Balance before</span>{money(item.balance_before, currency)}</td>
                    <td className={cellClass}><span className={labelClass}>Balance after</span>{money(item.balance_after, currency)}</td>
                    <td className={cellClass + " text-xs [overflow-wrap:anywhere]"}><span className={labelClass}>Reference</span>{item.reference_id || "—"}</td>
                    <td className={cellClass}><Link href={"/admin/customers/" + item.user_id + "/transactions/" + item.id} prefetch={false} className={buttonClass}>View receipt</Link></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {!transactions.length && <p className="p-6 text-center text-sm text-slate-500">No wallet activity matches these filters.</p>}
          </section>
          <nav aria-label="Wallet activity pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Page {filters.page.toLocaleString()} of {pages.toLocaleString()}</p>
            <div className="flex gap-2">{filters.page > 1 && <Link href={activityUrl({ ...filters, page: filters.page - 1 })} prefetch={false} className={buttonClass}>← Previous</Link>}{filters.page < pages && <Link href={activityUrl({ ...filters, page: filters.page + 1 })} prefetch={false} className={buttonClass}>Next →</Link>}</div>
          </nav>
        </>}
      </div>
    </main>
  </div>;
}
