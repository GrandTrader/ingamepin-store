import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import GiftPortDeliveryControl, { GiftPortRecipientForm } from "./GiftPortDeliveryControl";
import AdminSidebar from "../AdminSidebar";
import ProductSettingsActions from "@/components/ProductSettingsActions";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { giftPortRequest } from "@/lib/giftport-relay";
import type { GiftPortMapping } from "@/lib/giftport-types";
import GiftPortOptionEditor from "./GiftPortOptionEditor";

export default async function GiftPortSupplierView({ product, options, locked }: {
  product: { id: string; name: string; slug: string; stock_source: string };
  options: { id: string; option_name: string | null; denomination: number; denomination_currency: string | null; selling_price: number | null }[];
  locked: boolean;
}) {
  let mappings: GiftPortMapping[] = [], error = "";
  try { mappings = (await giftPortRequest<{ mappings: GiftPortMapping[] }>("links", { operation: "list", productId: product.id })).mappings; }
  catch (e) { error = e instanceof Error ? e.message : "GiftPort links are unavailable."; }
  const enabled = product.stock_source === "GIFTPORT";
  const admin = createAdminClient();
  const [recipient, jobs, pricing, rates, existingLimit] = await Promise.all([
    admin.from("giftport_settings").select("recipient_name,recipient_email,mobile").eq("id", true).maybeSingle(),
    admin.from("definiteplay_jobs").select("item_id,supplier_reference,state,issue,order_items!inner(product_id)").eq("provider", "GIFTPORT").eq("order_items.product_id", product.id).order("created_at", {ascending: false}).limit(20),
    admin.from("giftport_product_pricing").select("discount_percent,purchase_limit,updated_at").eq("product_id", product.id).maybeSingle(),
    admin.from("payment_gateway_settings").select("store_usd_inr_rate").eq("id", true).maybeSingle(),
    admin.from("definiteplay_stock").select("giftport_limit").eq("product_id", product.id).limit(1).maybeSingle(),
  ]);
  const savedRate = Number(rates.data?.store_usd_inr_rate);
  const rate = !rates.error && Number.isFinite(savedRate) && savedRate >= 1 && savedRate <= 1000 ? savedRate : null;
  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.slug}</p></div><ProductSettingsActions slug={product.slug}><Link href="/admin/giftport" className="rounded-xl border px-5 py-3 font-bold text-blue-600">GiftPort catalogue</Link></ProductSettingsActions></header>
    <div className="mt-8"><ProductEditPageTabs productId={product.id} current="supplier" /></div>
    <nav aria-label="Supplier provider" className="mt-5 flex gap-3"><Link href={`/admin/products/${product.id}/edit/supplier?provider=definiteplay`} className="rounded-lg border px-4 py-2 font-semibold">Definite Play</Link><Link href={`/admin/products/${product.id}/edit/supplier?provider=giftport`} aria-current="page" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">GiftPort</Link></nav>
    <div className="mt-5"><GiftPortRecipientForm recipient={recipient.data}/></div>
    <GiftPortDeliveryControl key={`${product.id}:${pricing.data?.updated_at ?? "unset"}`} productId={product.id} enabled={enabled} locked={locked && !enabled} rate={rate} discount={pricing.data ? Number(pricing.data.discount_percent) : null} purchaseLimit={pricing.data?.purchase_limit ?? existingLimit.data?.giftport_limit ?? 10} pricingReady={!pricing.error}/>
    {locked && !enabled && <p className="mt-3 text-sm text-amber-800">Switch the other supplier to uploaded stock before enabling GiftPort.</p>}
    {jobs.error && enabled && <p role="alert" className="mt-3 text-red-700">Unable to load supplier order history.</p>}
    {!!jobs.data?.length && <section className="mt-4 rounded-xl border p-4"><h2 className="font-bold">Recent GiftPort orders</h2>{jobs.data.map(job => <div key={job.item_id} className="mt-2 border-t pt-2 text-sm"><p className="font-semibold">{job.state}</p><p className="break-all text-slate-500">{job.supplier_reference}</p>{job.issue && <p className="text-amber-800">{job.issue}</p>}</div>)}</section>}
    <section className="mt-6 rounded-2xl border p-5"><h2 className="text-xl font-black">Link GiftPort brands</h2><p className="mt-2 text-sm text-slate-600">Choose the matching brand for each option. Face values must match the product option’s INR denomination.</p>{error ? <p role="alert" className="mt-4 text-red-700">{error} Reload this page before editing links.</p> : <div className="mt-5 space-y-5">{options.map(option => <fieldset key={option.id} disabled={locked}><GiftPortOptionEditor productId={product.id} option={option} mapping={mappings.find(m => m.option_id === option.id) || null} /></fieldset>)}{!options.length && <p>Add product options first, then return to link them.</p>}</div>}</section>
  </main></div></div>;
}
