import { notFound } from "next/navigation";
import Link from "@/components/ScopedAccountLink";
import { requireCustomer } from "@/lib/customer-account-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankInvoiceId, type BankDepositInvoice as Invoice } from "@/lib/bank-deposit-invoice";
import BankDepositInvoice from "@/components/BankDepositInvoice";
import BusinessActionForm from "@/components/BusinessActionForm";
import { submitInvoiceTransfer } from "../actions";
export const dynamic = "force-dynamic";
export default async function BankInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireCustomer(), { id } = await params;
  if (!bankInvoiceId.test(id)) notFound();
  const db = createAdminClient();
  const [result, deposit, settings] = await Promise.all([
    db.from("business_bank_invoices").select("id,invoice_number,amount_usd,buyer,bank_instructions,created_at").eq("id", id).eq("user_id", user.id).maybeSingle(),
    db.from("business_bank_deposits").select("status,credited_usd,note").eq("invoice_id", id).eq("user_id", user.id).maybeSingle(),
    db.from("business_bank_settings").select("enabled,instructions").eq("id", true).single(),
  ]);
  if (result.error || deposit.error || settings.error) throw Error("Unable to load the invoice. Please try again.");
  if (!result.data) notFound();
  const invoice = result.data as Invoice;
  const changed = !settings.data?.enabled || ["beneficiary", "account_number", "bank", "ifsc", "swift"].some(key => settings.data?.instructions?.[key] !== invoice.bank_instructions[key]);
  return <div className="mx-auto max-w-4xl space-y-5 p-5">
    <Link href="/account/business" className="inline-block text-blue-700 print:hidden">← Bank deposits and invoices</Link>
    {changed && !deposit.data && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm print:hidden">Bank instructions have changed or deposits are currently disabled. Contact support before sending money using this invoice.</p>}
    <BankDepositInvoice invoice={result.data as Invoice} />
    <section className="rounded-2xl border bg-white p-5 print:hidden"><h2 className="mb-3 text-lg font-bold">After making your bank transfer</h2>
      {deposit.data ? <div className="space-y-2 text-sm"><p>Transfer status: <strong>{deposit.data.status === "PENDING" ? "Awaiting bank verification" : deposit.data.status}</strong></p>{deposit.data.credited_usd != null && <p>Wallet credited: USD {Number(deposit.data.credited_usd).toFixed(2)}</p>}{deposit.data.note && <p>{deposit.data.note}</p>}</div> : <BusinessActionForm action={submitInvoiceTransfer} button="Submit transfer receipt for review">
        <input type="hidden" name="invoice_id" value={id} />
        <p className="text-sm">Invoice amount: USD {Number(result.data.amount_usd).toFixed(2)}. Submit once you have made the payment.</p>
        <label className="block text-sm font-bold">Bank transfer reference<input name="reference" required minLength={3} maxLength={100} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label>
        <label className="block text-sm font-bold">Transfer receipt (PDF / JPG / PNG, up to 1 MB)<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" required className="mt-2 w-full rounded-xl border p-3 font-normal" /></label>
      </BusinessActionForm>}
    </section>
  </div>;
}
