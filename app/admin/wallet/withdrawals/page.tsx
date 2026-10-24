import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReceiptId } from "@/lib/wallet-receipt";
import { WITHDRAWAL_SELECT, type Withdrawal, withdrawalDate } from "@/lib/wallet-withdrawals";
import WithdrawalHistory from "@/components/WithdrawalHistory";
import AdminSidebar from "../../AdminSidebar";
import { reviewWithdrawal } from "./actions";

export const dynamic = "force-dynamic";
type Params = { status?: string; customer?: string; page?: string; error?: string; success?: string };
const field = "min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2";
export default async function WithdrawalsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access denied");
  const admin = createAdminClient();
  const status = ["ACTIVE", "ALL", "REQUESTED", "APPROVED", "PAID", "REJECTED", "CANCELLED"].includes(params.status ?? "") ? params.status! : "ACTIVE";
  const customer = params.customer && isReceiptId(params.customer) ? params.customer : "";
  const parsedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 100000 ? parsedPage : 1;
  const pageSize = 20;
  let query = admin.from("wallet_withdrawal_requests").select(WITHDRAWAL_SELECT, { count: "exact" });
  if (customer) query = query.eq("user_id", customer);
  if (status === "ACTIVE") query = query.in("status", ["REQUESTED", "APPROVED"]);
  else if (status !== "ALL") query = query.eq("status", status);
  const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const rows = (result.data ?? []) as Withdrawal[];
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / pageSize));
  function pageUrl(next: number) { return "/admin/wallet/withdrawals?" + new URLSearchParams({ status, ...(customer ? { customer } : {}), page: String(next) }); }
  if (!result.error && page > pages) redirect(pageUrl(pages));
  const ids = [...new Set(rows.map(row => row.user_id))];
  const identities = await Promise.all(ids.map(async id => {
    const found = await admin.auth.admin.getUserById(id);
    return [id, found.data.user?.email ?? id] as const;
  }));
  const names = new Map(identities);
  const events = rows.length ? await admin.from("wallet_withdrawal_events").select("id,request_id,event,note,created_at").in("request_id", rows.map(row => row.id)).order("created_at", { ascending: true }).limit(200) : { data: [], error: null };
  return <div className="min-h-screen bg-slate-100 text-slate-950 md:flex"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-7"><div className="mx-auto max-w-5xl">
    <h1 className="text-2xl font-black">Crypto withdrawals</h1>
    <p className="mt-2 text-sm text-slate-600">Review customer requests, send USDT manually, then record the transaction hash. Approval does not send crypto.</p>
    <nav className="mt-4 flex flex-wrap gap-3 text-sm font-bold text-blue-700"><Link href="/admin/wallet/activity">Wallet activity</Link><Link href="/admin/wallet">Top-up requests</Link>{customer && <Link href={"/admin/customers/" + customer}>Customer profile</Link>}</nav>
    {params.success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-800">{params.success}</p>}
    {params.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{params.error}</p>}
    <form action="/admin/wallet/withdrawals" className="mt-5 flex flex-wrap items-end gap-3">
      {customer && <input type="hidden" name="customer" value={customer} />}
      <label className="grid gap-1 text-sm font-bold">Status<select name="status" defaultValue={status} className={field}>{[["ACTIVE", "Awaiting review / payout"], ["ALL", "All withdrawals"], ["REQUESTED", "Awaiting approval"], ["APPROVED", "Approved"], ["PAID", "Paid"], ["REJECTED", "Rejected"], ["CANCELLED", "Cancelled"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Apply</button>
      {customer && <Link href="/admin/wallet/withdrawals" className={field}>All customers</Link>}
    </form>
    {result.error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">Unable to load withdrawals. Check that the database update has been installed.</p> : <>
      <p className="mt-4 text-xs text-slate-500">{result.count ?? 0} requests · Page {page} of {pages}</p>
      <div className="mt-3 space-y-4">{rows.map(row => {
        const assigned = row.status === "APPROVED" && row.reviewed_by === user.id;
        return <article key={row.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <Link href={"/admin/customers/" + row.user_id} className="mb-3 block break-all text-sm font-bold text-blue-700">{names.get(row.user_id)}</Link>
          <WithdrawalHistory row={row} />
          {row.status === "REQUESTED" && <form action={reviewWithdrawal} className="mt-4 space-y-3 rounded-xl bg-blue-50 p-3"><input type="hidden" name="request_id" value={row.id} /><input type="hidden" name="action" value="APPROVE" /><label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required /><span>I have reviewed this request and will handle its manual payout.</span></label><button className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Approve & assign to me</button></form>}
          {assigned && <form action={reviewWithdrawal} className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <input type="hidden" name="request_id" value={row.id} /><input type="hidden" name="action" value="PAY" />
            <p className="text-sm font-bold">Send {Number(row.net_usdt).toFixed(2)} USDT on {row.network} to the address above.</p><p className="text-xs">Check your sending wallet for an existing transfer before sending. Record the hash here after the transfer is confirmed.</p>
            <label className="grid gap-1 text-sm font-bold">Transaction hash<input required name="note" maxLength={100} autoComplete="off" spellCheck={false} className={field + " w-full font-mono text-xs"} /></label>
            <label className="flex gap-2 text-sm"><input type="checkbox" required name="confirmed" value="yes" /><span>I verified the confirmed transfer, receiving address, network and exact USDT amount.</span></label>
            <button className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">Record completed payout</button>
          </form>}
          {row.status === "APPROVED" && !assigned && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Assigned to another administrator. Only the approving administrator can record or reject this payout.</p>}
          {(row.status === "REQUESTED" || assigned) && <details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-red-700">Reject request & release funds</summary><form action={reviewWithdrawal} className="mt-3 space-y-3"><input type="hidden" name="request_id" value={row.id} /><input type="hidden" name="action" value="REJECT" /><label className="grid gap-1 text-sm">Reason shown to customer<input name="note" required minLength={3} maxLength={500} className={field} /></label><label className="flex gap-2 text-sm"><input type="checkbox" required name="confirmed" value="yes" /><span>No crypto has been sent for this request. Release the full reserved amount.</span></label><button className="min-h-11 rounded-lg border border-red-300 px-4 py-2 font-bold text-red-700">Reject & release funds</button></form></details>}
          <details className="mt-4"><summary className="cursor-pointer text-xs font-bold text-slate-500">Audit history</summary>{events.error ? <p className="mt-2 text-xs">Unable to load audit history.</p> : <ul className="mt-2 space-y-2 text-xs">{(events.data ?? []).filter(event => event.request_id === row.id).map(event => <li key={event.id} className="break-all">{withdrawalDate(event.created_at)} IST · {event.event}{event.note ? " · " + event.note : ""}</li>)}</ul>}</details>
        </article>;
      })}{rows.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-slate-500">No withdrawal requests match this filter.</p>}</div>
      <nav className="mt-4 flex justify-between gap-3 text-sm font-bold text-blue-700">{page > 1 ? <Link href={pageUrl(page - 1)}>← Previous</Link> : <span />}{page < pages && <Link href={pageUrl(page + 1)}>Next →</Link>}</nav>
    </>}
  </div></main></div>;
}
