import ProductSettingsActions from "@/components/ProductSettingsActions";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { requireDefinitePlayAdmin, validProductId } from "@/lib/definiteplay-admin";
import { getDefinitePlayMappings } from "@/lib/definiteplay-relay";
import type { DefinitePlayMapping } from "@/lib/definiteplay-types";
import SupplierOptionEditor from "./SupplierOptionEditor";
import SupplierDeliveryControl from "./SupplierDeliveryControl";
import { supplierDeliveryEnabled } from "@/lib/definiteplay-fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export default async function ProductSupplierPage({params}:{params:Promise<{id:string}>}) {
  const session = await requireDefinitePlayAdmin();
  const {id} = await params;
  if (!validProductId(id)) notFound();
  const [product, options] = await Promise.all([
    session.from("products").select("id,name,slug,stock_source").eq("id",id).maybeSingle(),
    session.from("product_options").select("id,option_name,denomination,denomination_currency,selling_price").eq("product_id",id).order("sort_order"),
  ]);
  if (product.error || options.error) throw new Error("Unable to load product details.");
  if (!product.data) notFound();
  if (product.data.stock_source === "GIFTPORT") return <main className="p-6"><h1 className="text-xl font-bold">Supplier disconnected</h1><p className="mt-3">This product cannot accept new supplier orders. Existing orders require manual review.</p><Link href="/admin/products" className="mt-4 inline-block text-blue-600">Return to products</Link></main>;
  const enabled=product.data.stock_source === "DEFINITEPLAY";
  const configured=enabled||supplierDeliveryEnabled();
  const pricing=enabled && options.data?.length ? await createAdminClient().from("definiteplay_price_rules")
    .select("option_id,base_unit_cost,base_selling_price").in("option_id",options.data.map(option=>option.id)) : null;
  const jobs=configured ? await createAdminClient().from("definiteplay_jobs")
    .select("item_id,supplier_reference,state,issue,order_items!inner(product_id)")
    .eq("order_items.product_id",id).order("created_at",{ascending:false}).limit(20) : null;
  let mappings:DefinitePlayMapping[]=[];
  let error="";
  try { mappings=(await getDefinitePlayMappings(id)).mappings; }
  catch(e){error=e instanceof Error?e.message:"Supplier connection unavailable.";}
  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
    <AdminSidebar/><main className="min-w-0 flex-1 p-5 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p>
        <h1 className="mt-2 text-3xl font-black">{product.data.name}</h1><p className="mt-1 text-sm text-slate-500">{product.data.slug}</p></div>
        <ProductSettingsActions slug={product.data.slug}><Link href="/admin/definiteplay" className="rounded-xl border px-5 py-3 font-bold text-blue-600">Supplier catalogue</Link></ProductSettingsActions></header>
      <div className="mt-8"><ProductEditPageTabs productId={id} current="supplier"/></div>
      <SupplierDeliveryControl productId={id} enabled={enabled} configured={configured}/>
      {enabled && <p role="status" className="mt-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{pricing?.error
        ? "Automatic price updates are awaiting the supplier pricing database update."
        : "Selling prices follow supplier costs automatically, keeping each option’s markup. Editing a selling price sets its new markup."}</p>}
      {jobs?.data?.length ? <section className="mt-6 rounded-2xl border p-5"><h2 className="font-black">Recent supplier orders</h2>
        {jobs.data.map(job=><div key={job.item_id} className="mt-3 border-t pt-3 text-sm"><p className="font-bold">{job.state}</p><p className="break-all text-slate-500">{job.supplier_reference}</p>{job.issue&&<p className="text-amber-800">{job.issue}</p>}</div>)}</section>:null}
      <section className="mt-6 rounded-2xl border p-5 sm:p-6"><h2 className="text-xl font-black">Link Definite Play products</h2>
        <p className="mt-2 text-sm text-slate-600">Choose the matching supplier item for each option. Check its region, value and edition before saving.</p>
        <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{enabled ? "Supplier delivery is enabled. Switch to uploaded stock before changing these links." : "Links alone do not enable purchasing. Enable supplier stock and delivery above when setup is ready."}</p>
        {error?<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error} Refresh the page before making changes.</p>:
          <div className="mt-5 space-y-5">{(options.data??[]).map(option=><fieldset key={option.id} disabled={enabled}><SupplierOptionEditor productId={id} option={option} mapping={mappings.find(m=>m.option_id===option.id)??null} pricing={pricing?.data?.find(rule=>rule.option_id===option.id)??null}/></fieldset>)}
          {!options.data?.length&&<p>Add product options first, then return here to link them.</p>}</div>}
      </section>
    </main></div></div>;
}
