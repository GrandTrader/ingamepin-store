import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankInvoiceId, type BankDepositInvoice as Invoice } from "@/lib/bank-deposit-invoice";
import BankDepositInvoice from "@/components/BankDepositInvoice";
export const dynamic = "force-dynamic";
export default async function AdminBankInvoice({ params }: { params: Promise<{ id: string }> }) {
  await requireBusinessAdmin(); const { id } = await params;
  if (!bankInvoiceId.test(id)) notFound();
  const result = await createAdminClient().from("business_bank_invoices").select("id,invoice_number,amount_usd,buyer,bank_instructions,created_at").eq("id", id).maybeSingle();
  if (result.error) throw Error("Unable to load the bank invoice.");
  if (!result.data) notFound();
  return <main className="mx-auto max-w-4xl p-5"><Link href="/admin/business-verification/deposits" className="mb-5 inline-block text-blue-700 print:hidden">← Bank deposits</Link><BankDepositInvoice invoice={result.data as Invoice} /></main>;
}
