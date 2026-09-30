import type { BankDepositInvoice as Invoice } from "@/lib/bank-deposit-invoice";
import PrintSavedInvoiceButton from "@/app/admin/invoices/[id]/PrintSavedInvoiceButton";

export default function BankDepositInvoice({ invoice }: { invoice: Invoice }) {
  const bank = invoice.bank_instructions;
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(invoice.amount_usd));
  return <>
    <div className="mb-4 print:hidden"><PrintSavedInvoiceButton /></div>
    <style>{`@media print {
      @page { size: A4; margin: 12mm; }
      body * { visibility: hidden !important; }
      body *:not(#bank-invoice):not(#bank-invoice *):not(:has(#bank-invoice)) { display: none !important; }
      body, body *:has(#bank-invoice) { display: block !important; position: static !important; min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: white !important; }
      #bank-invoice, #bank-invoice * { visibility: visible !important; }
      #bank-invoice { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: white !important; color: #111827 !important; font-size: 11px !important; }
      #bank-invoice section, #bank-invoice table { break-inside: avoid; }
    }`}</style>
    <article id="bank-invoice" className="mx-auto max-w-4xl space-y-6 rounded-2xl border bg-white p-6 text-slate-900 sm:p-8">
      <header className="flex flex-wrap justify-between gap-4 border-b pb-5">
        <div><p className="text-3xl font-black">iNgame<span className="text-cyan-600">PIN</span></p><p className="mt-1 text-sm">Business wallet bank deposit</p></div>
        <div><h1 className="text-xl font-black">PRO FORMA INVOICE</h1><p className="mt-2 text-sm font-bold">{invoice.invoice_number}</p><p className="text-sm">Issued: {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(invoice.created_at))}</p></div>
      </header>
      <section className="grid gap-5 text-sm sm:grid-cols-2">
        <div><h2 className="mb-2 font-bold">From / Beneficiary</h2><p className="font-bold">InGamePIN · {bank.beneficiary}</p><p className="whitespace-pre-wrap">{bank.beneficiary_address}</p><p>www.ingamepin.com</p></div>
        <div><h2 className="mb-2 font-bold">Bill to</h2><p className="font-bold">{invoice.buyer.name}</p><p className="whitespace-pre-wrap">{invoice.buyer.address}</p><p>{invoice.buyer.country}</p><p>{invoice.buyer.email}</p><p>Registration / tax no.: {invoice.buyer.registration_number}</p></div>
      </section>
      <table className="w-full text-left text-sm"><thead className="border-y bg-slate-50"><tr><th className="p-3">Description</th><th className="p-3 text-right">Amount (USD)</th></tr></thead><tbody><tr className="border-b"><td className="p-3">Advance deposit to InGamePIN business wallet for future digital-product purchases</td><td className="p-3 text-right font-bold">{money}</td></tr></tbody><tfoot><tr><th className="p-3">Total requested (USD)</th><td className="p-3 text-right text-lg font-black">{money}</td></tr></tfoot></table>
      <section className="rounded-xl border p-4 text-sm"><h2 className="mb-3 font-bold">Bank transfer details</h2><dl className="grid gap-x-5 gap-y-2 sm:grid-cols-[170px_1fr]">
        {([["Beneficiary", bank.beneficiary], ["Account number", bank.account_number], ["Bank", bank.bank], ["Branch", bank.branch_address], ["IFSC", bank.ifsc], ["SWIFT / BIC", bank.swift], ["Payment reference", invoice.invoice_number]]).map(([label, value]) => <div key={label} className="contents"><dt className="text-slate-600">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>)}
      </dl><p className="mt-3 whitespace-pre-wrap">{bank.routing_instructions}</p></section>
      <section className="space-y-2 text-xs text-slate-600"><p>Pay from your registered business account. Include the invoice number as the payment reference and upload your transfer receipt against this invoice.</p><p>Bank charges and currency conversion may reduce the amount credited. The final USD wallet credit is based on verified settled funds and the recorded conversion rate.</p><p className="font-bold">This is a pro forma payment request, not a tax invoice or proof of payment. Generating this document does not credit your wallet or confirm a product purchase.</p></section>
    </article>
  </>;
}
