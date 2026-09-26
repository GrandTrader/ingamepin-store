import styles from "./Receipt.module.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPaymentMethod } from "@/lib/payment-method-label";
import { getUsdtInvoice, type UsdtInvoice } from "@/lib/usdt-gateway";
import { isReceiptId, matchesReceiptInvoice, receiptExplorerUrl } from "@/lib/wallet-receipt";
import PrintSavedInvoiceButton from "@/app/admin/invoices/[id]/PrintSavedInvoiceButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet transaction receipt | InGamePin", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string; transactionId: string }> };
type Topup = { id: string; amount: number; currency: string; payment_method: string; payment_reference: string | null; status: string; gateway_order_id: string | null; gateway_transaction_id: string | null; created_at: string; paid_at: string | null; reviewed_at: string | null };
const money = (value: number | string, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
function date(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "Not recorded";
}
function Field({ label, children }: { label: string; children?: ReactNode }) {
  return <div className="min-w-0 border-b border-slate-100 py-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{children ?? "Not recorded"}</dd></div>;
}

export default async function WalletTransactionReceipt({ params }: Props) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Access denied");
  const { id, transactionId } = await params;
  if (!isReceiptId(id) || !isReceiptId(transactionId)) notFound();
  const admin = createAdminClient();
  const result = await admin.from("wallet_transactions")
    .select("id,user_id,transaction_type,amount,balance_before,balance_after,description,order_id,reference_id,created_at")
    .eq("id", transactionId).eq("user_id", id).maybeSingle();
  if (result.error) throw new Error("Unable to load this wallet transaction. Please try again.");
  if (!result.data) notFound();
  const transaction = result.data;
  const [customerResult, walletResult] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("customer_wallets").select("currency").eq("user_id", id).maybeSingle(),
  ]);
  if (customerResult.error || !customerResult.data.user || walletResult.error) throw new Error("Unable to load receipt details. Please try again.");
  const customer = customerResult.data.user;
  const customerName = String(customer.user_metadata?.full_name ?? customer.user_metadata?.name ?? customer.email ?? "Customer");
  const currency = walletResult.data?.currency ?? "USD";
  let topup: Topup | null = null;
  // A reference can also be an order number or a refund; only load a matching customer's top-up.
  if (transaction.reference_id && isReceiptId(transaction.reference_id)) {
    const topupResult = await admin.from("wallet_topup_requests")
      .select("id,amount,currency,payment_method,payment_reference,status,gateway_order_id,gateway_transaction_id,created_at,paid_at,reviewed_at")
      .eq("id", transaction.reference_id).eq("user_id", id).maybeSingle();
    if (topupResult.error) throw new Error("Unable to load the linked payment. Please try again.");
    topup = topupResult.data;
  }
  let invoice: UsdtInvoice | null = null;
  let gatewayNotice = "";
  if (topup?.payment_method === "USDT_DIRECT" && topup.gateway_order_id) {
    try {
      const candidate = await getUsdtInvoice(topup.gateway_order_id);
      if (matchesReceiptInvoice(candidate, topup)) invoice = candidate;
      else gatewayNotice = "The gateway details could not be matched to this receipt. Saved payment details are shown below.";
    } catch {
      gatewayNotice = "The payment gateway is temporarily unavailable. Saved payment details are shown below; reopen this receipt to retry.";
    }
  }
  const orderResult = transaction.order_id ? await admin.from("orders")
    .select("id,order_number,status,total,currency,created_at,paid_at,customer_id,customer_email,order_items(id,product_name,option_name,quantity,unit_price,total_price)")
    .eq("id", transaction.order_id).maybeSingle() : null;
  if (orderResult?.error) throw new Error("Unable to load the linked order. Please try again.");
  const order = orderResult?.data;
  // The ledger already belongs to this customer; additionally reject inconsistent linked orders.
  if (order && order.customer_id !== id && (!customer.email || order.customer_email?.toLowerCase() !== customer.email.toLowerCase())) notFound();
  const explorer = invoice ? receiptExplorerUrl(invoice.network, invoice.transactionHash) : null;
  const credited = Number(transaction.balance_after) >= Number(transaction.balance_before);

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-8 print:bg-white print:p-0">
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/customers/${id}`} className="font-bold text-blue-600">← Customer wallet activity</Link>
        <PrintSavedInvoiceButton />
      </div>
      <article className={`${styles.receipt} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 print:border-0 print:shadow-none`}>
        <header className="flex flex-wrap justify-between gap-5 border-b border-slate-200 pb-6">
          <div><p className="text-xl font-black">iNgame<span className="text-cyan-600">PIN</span></p><h1 className="mt-3 text-2xl font-black">Wallet transaction receipt</h1><p className="mt-2 text-sm text-slate-500">{date(transaction.created_at)}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{transaction.transaction_type}</p><p className={`mt-2 text-3xl font-black ${credited ? "text-emerald-700" : "text-slate-950"}`}>{credited ? "+" : "−"}{money(transaction.amount, currency)}</p><p className="mt-2 text-sm font-bold text-emerald-700">Recorded in wallet</p></div>
        </header>
        <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <Field label="Customer">{customerName}</Field><Field label="Email">{customer.email}</Field>
          <Field label="Wallet transaction ID">{transaction.id}</Field><Field label="Customer ID">{id}</Field>
          <Field label="Activity">{transaction.description}</Field><Field label="Reference">{transaction.reference_id}</Field>
          <Field label="Balance before">{money(transaction.balance_before, currency)}</Field><Field label="Balance after">{money(transaction.balance_after, currency)}</Field>
        </dl>
        {topup && <section className="mt-7">
          <h2 className="text-lg font-black">Payment details</h2>
          <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
            <Field label="Payment method">{formatPaymentMethod(topup.payment_method)}</Field><Field label="Top-up status">{topup.status}</Field>
            <Field label="Top-up amount">{money(topup.amount, topup.currency)}</Field><Field label="Top-up request ID">{topup.id}</Field>
            <Field label="Requested at">{date(topup.created_at)}</Field><Field label="Paid at">{date(topup.paid_at)}</Field>
            <Field label="Reviewed at">{date(topup.reviewed_at)}</Field><Field label="Payment reference">{topup.payment_reference}</Field>
            <Field label="Gateway invoice ID">{topup.gateway_order_id}</Field><Field label="Transaction hash / payment ID">{topup.gateway_transaction_id}</Field>
          </dl>
        </section>}
        {gatewayNotice && <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{gatewayNotice}</p>}
        {invoice && <section className="mt-7">
          <h2 className="text-lg font-black">Blockchain payment receipt</h2>
          <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
            <Field label="Network">{invoice.network === "BEP20" ? "BNB Smart Chain (BEP20)" : invoice.network}</Field><Field label="Gateway status">{invoice.status}</Field>
            <Field label="Requested crypto amount">{invoice.amount} {invoice.token}</Field><Field label="Received crypto amount">{invoice.receivedAmount ? `${invoice.receivedAmount} ${invoice.token}` : "Not recorded"}</Field>
            <Field label="Sender address">{invoice.payerAddress}</Field><Field label="Receiving address">{invoice.address}</Field>
            <Field label="Blockchain transaction hash">{invoice.transactionHash}</Field><Field label="Gateway paid at">{date(invoice.paidAt ? new Date(invoice.paidAt * 1000).toISOString() : null)}</Field>
          </dl>
          {explorer && <a href={explorer} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white print:text-blue-700">View blockchain transaction ↗</a>}
        </section>}
        {order && <section className="mt-7">
          <h2 className="text-lg font-black">Linked order</h2>
          <dl className="mt-2 grid gap-x-8 sm:grid-cols-2"><Field label="Order number">{order.order_number}</Field><Field label="Order status">{order.status}</Field><Field label="Order total">{money(order.total, order.currency)}</Field><Field label="Order date">{date(order.created_at)}</Field></dl>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="py-3 pr-3">Product / option</th><th className="p-3">Quantity</th><th className="p-3">Unit price</th><th className="p-3">Total</th></tr></thead><tbody>{order.order_items.map(item => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 pr-3">{item.product_name}<span className="block text-xs text-slate-500">{item.option_name}</span></td><td className="p-3">{item.quantity}</td><td className="whitespace-nowrap p-3">{money(item.unit_price, order.currency)}</td><td className="whitespace-nowrap p-3">{money(item.total_price, order.currency)}</td></tr>)}</tbody></table></div>
          <Link href={`/admin/orders/${order.id}/receipt`} className="mt-4 inline-flex font-bold text-blue-600 print:hidden">View full order receipt →</Link>
        </section>}
        {!topup && !order && <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This wallet entry has no linked top-up or order record. All saved transaction details are shown above.</p>}
        <footer className="mt-7 border-t border-slate-200 pt-4 text-xs text-slate-500">All times are India Standard Time (UTC+05:30). This receipt records website wallet activity; wallet balances are separate from blockchain wallet balances.</footer>
      </article>
    </div>
  </main>;
}
