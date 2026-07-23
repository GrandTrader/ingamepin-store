import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { approveWalletTopup, rejectWalletTopup } from "./actions";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; success?: string }> };
type RequestRow = { id: string; user_id: string; amount: number | string; payment_method: string; payment_reference: string; status: string; rejection_reason: string | null; created_at: string };
const money = (value: number | string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

export default async function AdminWalletPage({ searchParams }: Props) {
  const messages = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const check = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!check.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const result = await admin.from("wallet_topup_requests").select("id, user_id, amount, payment_method, payment_reference, status, rejection_reason, created_at").order("created_at", { ascending: false });
  const requests = (result.data ?? []) as RequestRow[];
  const userIds = [...new Set(requests.map((request) => request.user_id))];
  const entries = await Promise.all(userIds.map(async (id) => {
    const customer = await admin.auth.admin.getUserById(id);
    return [id, { email: customer.data.user?.email ?? "Unknown email", name: String(customer.data.user?.user_metadata?.full_name ?? "Customer") }] as const;
  }));
  const customers = new Map(entries);
  const pending = requests.filter((request) => request.status === "PENDING").length;
  const approved = requests.filter((request) => request.status === "APPROVED").reduce((sum, request) => sum + Number(request.amount), 0);

  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
    <AdminSidebar walletCount={pending} />
    <main className="min-w-0 flex-1 p-5 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Customer funds</p><h1 className="mt-2 text-3xl font-black">Wallet top-ups</h1><p className="mt-1 text-sm text-slate-500">Verify payment references before crediting customer wallets.</p>
      {messages.success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-700">{messages.success}</div>}
      {messages.error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{messages.error}</div>}
      <section className="mt-7 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Pending review</p><p className="mt-2 text-3xl font-black text-amber-600">{pending}</p></div><div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Total requests</p><p className="mt-2 text-3xl font-black">{requests.length}</p></div><div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Approved value</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(approved)}</p></div></section>
      {result.error && <p className="mt-7 rounded-xl bg-red-50 p-4 text-red-700">{result.error.message}</p>}
      <section className="mt-8 grid gap-5">{requests.length === 0 ? <div className="rounded-2xl border border-slate-200 p-8 text-center text-slate-500">No wallet top-up requests yet.</div> : requests.map((request) => {
        const customer = customers.get(request.user_id);
        const style = request.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : request.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
        return <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-2xl font-black">{money(request.amount)}</p><p className="mt-2 font-bold">{customer?.name}</p><p className="text-sm text-slate-500">{customer?.email}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}>{request.status}</span></div><div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><div><p className="text-xs text-slate-400">Method</p><p className="mt-1 font-bold">{request.payment_method}</p></div><div><p className="text-xs text-slate-400">Payment reference</p><p className="mt-1 break-all font-bold">{request.payment_reference}</p></div><div><p className="text-xs text-slate-400">Submitted</p><p className="mt-1 font-bold">{date(request.created_at)}</p></div></div>{request.status === "PENDING" && <div className="mt-5 grid gap-4 lg:grid-cols-[auto_1fr]"><form action={approveWalletTopup}><input type="hidden" name="request_id" value={request.id} /><button className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Approve & credit wallet</button></form><form action={rejectWalletTopup} className="flex flex-col gap-3 sm:flex-row"><input type="hidden" name="request_id" value={request.id} /><input name="reason" required minLength={3} maxLength={500} placeholder="Reason for rejection" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" /><button className="rounded-xl border border-red-300 px-5 py-3 font-black text-red-600">Reject</button></form></div>}{request.rejection_reason && <p className="mt-4 text-sm text-red-600">Reason: {request.rejection_reason}</p>}</article>;
      })}</section>
    </main>
  </div></div>;
}
