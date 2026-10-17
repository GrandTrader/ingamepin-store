import Link from "next/link";
import type { FKWalletProductImport, FKWalletSavedLink } from "@/lib/fkwallet-product-supplier";
import FKWalletDeliveryControl from "./FKWalletDeliveryControl";

type Option = { id: string; option_name: string | null; selling_price: number | null };
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);

export default function FKWalletSupplierPanel({ productId, imported, options, links, enabled = false, delivery }: {
  productId: string; imported: FKWalletProductImport; options: Option[]; links: FKWalletSavedLink[];
  enabled?: boolean; delivery?: { ready: boolean; deliveryKind: string; jobs?: { item_id: string; order_id: string; state: string; issue: string | null }[] };
}) {
  const linked = options.filter(option => links.some(link => link.optionId === option.id)).length;
  const currencies = [...new Set(links.map(link => link.currency))];
  return <>
    <section aria-label="FKWallet delivery status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-xl font-black">FKWallet stock and delivery</h2>
      <p className="mt-3 font-bold text-amber-900">{enabled ? "Automatic customer delivery is enabled" : "Automatic customer delivery is not enabled"}</p>
      <p className="mt-2 text-sm text-slate-700">After verified customer payment, FKWallet purchases the linked option using your supplier balance. Delivery completes after the supplier confirms success.</p>
      <FKWalletDeliveryControl productId={productId} enabled={enabled} ready={!!delivery?.ready && linked === options.length && linked > 0} deliveryKind={delivery?.deliveryKind ?? "CODE"}/>
    </section>
    {!!delivery?.jobs?.length && <section className="mt-6 rounded-2xl border p-5"><h2 className="font-black">Recent automatic deliveries</h2>
      {delivery.jobs.map(job => <div key={job.item_id} className="mt-3 border-t pt-3 text-sm"><p className="font-bold">{job.state}</p>{job.issue && <p className="mt-1 text-amber-900">{job.issue}</p>}<Link className="mt-2 inline-block font-bold text-blue-700 underline" href={`/admin/orders/${job.order_id}/receipt`}>View customer order</Link></div>)}
    </section>}
    <section aria-label="Saved FKWallet product links" className="mt-6 rounded-2xl border border-slate-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Linked FKWallet products</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">{linked} of {options.length} options linked</span></div>
      <p className="mt-3 text-sm text-slate-600">Saved markup: {number(Number(imported.markup_percent))}%{currencies.length === 1 && ` · Saved exchange rate: 1 USD = ${number(Number(imported.exchange_rate))} ${currencies[0]}`}</p>
      <p className="mt-2 text-sm text-slate-600">Supplier costs and selling prices refresh automatically using this markup and exchange rate. Manual price edits are replaced on the next refresh. Existing customer orders keep their original prices.</p>
      <div className="mt-5 space-y-4">{options.map(option => {
        const link = links.find(item => item.optionId === option.id);
        return <article key={option.id} className="rounded-xl border border-slate-200 p-4">
          <h3 className="break-words font-black">{option.option_name || "Product option"}</h3>
          <p className="mt-2 text-sm">Your selling price: USD {Number(option.selling_price ?? 0).toFixed(2)}</p>
          {link ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-bold">Linked to FKWallet · #{link.supplierId}</p><p className="mt-1 break-words">{link.name}</p>
            <p className="mt-2">Current supplier cost: {number(link.cost)} {link.currency}</p>
          </div> : <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This option has no saved FKWallet link. It is not ready for supplier delivery.</p>}
        </article>;
      })}</div>
      {!options.length && <p className="mt-4 text-sm">No product options found.</p>}
      <div className="mt-5 flex flex-wrap gap-3 text-sm font-bold">
        <Link className="rounded-xl border px-4 py-3 text-blue-700" href={`/admin/products/${productId}/edit/product-options`}>Product options</Link>
        <Link className="rounded-xl border px-4 py-3 text-blue-700" href={`/admin/products/${productId}/edit/customer-information`}>Customer information</Link>
      </div>
    </section>
  </>;
}
