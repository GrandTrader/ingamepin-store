import Link from "@/components/ScopedAccountLink";
import { createAdminClient } from "@/lib/supabase/admin";
import GenerateBankInvoice from "./GenerateBankInvoice";

export default async function BankInvoicePanel({ userId, page }: { userId: string; page: number }) {
  const result = await createAdminClient().from("business_bank_invoices").select("id,invoice_number,amount_usd,created_at").eq("user_id", userId).order("created_at", { ascending: false }).order("id").range((page - 1) * 10, page * 10);
  if (result.error) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">Bank invoice setup is not available yet. Please contact support before making a bank transfer.</p>;
  return <div className="space-y-5">
    <div className="rounded-xl border bg-slate-50 p-4"><h3 className="mb-2 font-bold">Generate an invoice before you pay</h3><p className="mb-4 text-sm">Enter the USD amount to generate your pro forma invoice using your approved business details. Print or save it as a PDF for your bank, then upload the receipt on the invoice page.</p><GenerateBankInvoice /></div>
    {!!result.data?.length && <div><h3 className="mb-2 font-bold">Bank deposit invoices</h3><div className="divide-y rounded-xl border">{result.data.slice(0, 10).map(invoice => <Link key={invoice.id} href={`/account/business/invoices/${invoice.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong>{invoice.invoice_number}</strong><br />{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(invoice.created_at))}</span><span>USD {Number(invoice.amount_usd).toFixed(2)} · <span className="text-blue-700 underline">View invoice</span></span></Link>)}</div></div>}
    <nav className="flex justify-between text-sm text-blue-700">{page > 1 ? <Link href={`?invoice_page=${page - 1}`}>Newer invoices</Link> : <span />}{result.data && result.data.length > 10 && <Link href={`?invoice_page=${page + 1}`}>Older invoices</Link>}</nav>
  </div>;
}
