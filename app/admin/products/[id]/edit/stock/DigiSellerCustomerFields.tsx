import { createAdminClient } from "@/lib/supabase/admin";
import { syncDigiSellerCustomerFields } from "./digiseller-actions";

export default async function DigiSellerCustomerFields({ productId, optionIds, digiIds }: { productId: string; optionIds: string[]; digiIds: (number | null)[] }) {
  const db = createAdminClient();
  const imported = await db.from("fkwallet_imports").select("product_id").eq("product_id", productId).maybeSingle();
  if (!imported.data) return null;
  const [fields, links, delivery, jobs] = await Promise.all([
    db.from("product_customer_fields").select("id,label").eq("product_id", productId).order("sort_order"),
    db.from("digiseller_fkwallet_products").select("digiseller_product_id,ready").eq("product_id", productId),
    db.from("fkwallet_delivery_settings").select("delivery_kind").eq("product_id", productId).maybeSingle(),
    db.from("digiseller_fkwallet_jobs").select("invoice_id,state,issue").in("option_id", optionIds).order("created_at", { ascending: false }).limit(10),
  ]);
  const ready = !links.error && !fields.error && !delivery.error && digiIds.length > 0
    && digiIds.every(id => id !== null && links.data?.some(link => Number(link.digiseller_product_id) === id && link.ready)) && !!delivery.data;
  return <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
    <h2 className="text-xl font-black">DigiSeller customer information</h2>
    <p className="mt-2 text-sm">{ready ? "Customer fields are connected for automatic FKWallet delivery." : "Connect the required customer fields before accepting DigiSeller orders."}</p>
    <div className="mt-3 flex flex-wrap gap-2">{(fields.data ?? []).map(field => <span key={field.id} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold">{field.label} · Required</span>)}</div>
    <p className="mt-3 text-sm text-slate-600">After verified payment, these details are sent to FKWallet. DigiSeller receives confirmation only after delivery succeeds.</p>
    {links.error ? <p className="mt-3 text-sm font-bold text-amber-800">Install the DigiSeller customer delivery database update first.</p> :
      <form action={syncDigiSellerCustomerFields.bind(null, productId)} className="mt-4"><button className="admin-save-action rounded-xl px-5 py-3 text-sm font-black">Sync customer fields</button></form>}
    {!delivery.data && <p className="mt-3 text-sm font-bold text-amber-800">Enable FKWallet automatic delivery in the Supplier tab.</p>}
    {!!jobs.data?.length && <div className="mt-5 space-y-2"><h3 className="font-black">Recent DigiSeller deliveries</h3>{jobs.data.map(job => <div key={job.invoice_id} className="rounded-lg bg-white p-3 text-sm"><strong>Invoice {job.invoice_id}</strong><span className="ml-3">{job.state}</span>{job.issue && <p className="mt-1 text-slate-600">{job.issue}</p>}</div>)}</div>}
  </section>;
}
