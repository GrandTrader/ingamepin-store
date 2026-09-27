import Link from "next/link";
import AdminSidebar from "../AdminSidebar";
import ProductSettingsActions from "@/components/ProductSettingsActions";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { giftPortRequest } from "@/lib/giftport-relay";
import type { GiftPortMapping } from "@/lib/giftport-types";
import GiftPortOptionEditor from "./GiftPortOptionEditor";

export default async function GiftPortSupplierView({ product, options, locked }: {
  product: { id: string; name: string; slug: string };
  options: { id: string; option_name: string | null; denomination: number; denomination_currency: string | null; selling_price: number | null }[];
  locked: boolean;
}) {
  let mappings: GiftPortMapping[] = [], error = "";
  try { mappings = (await giftPortRequest<{ mappings: GiftPortMapping[] }>("links", { operation: "list", productId: product.id })).mappings; }
  catch (e) { error = e instanceof Error ? e.message : "GiftPort links are unavailable."; }
  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.slug}</p></div><ProductSettingsActions slug={product.slug}><Link href="/admin/giftport" className="rounded-xl border px-5 py-3 font-bold text-blue-600">GiftPort catalogue</Link></ProductSettingsActions></header>
    <div className="mt-8"><ProductEditPageTabs productId={product.id} current="supplier" /></div>
    <nav aria-label="Supplier provider" className="mt-5 flex gap-3"><Link href={`/admin/products/${product.id}/edit/supplier?provider=definiteplay`} className="rounded-lg border px-4 py-2 font-semibold">Definite Play</Link><Link href={`/admin/products/${product.id}/edit/supplier?provider=giftport`} aria-current="page" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">GiftPort</Link></nav>
    <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="text-xl font-black">GiftPort supplier delivery</h2><p className="mt-2 text-sm">These links prepare your product options for GiftPort. Automatic purchasing and delivery are not enabled yet. Supplier costs, order reconciliation and delivery verification must be completed before activation.</p>{locked && <p className="mt-3 font-semibold text-amber-800">Another supplier is active. Switch to uploaded stock in its supplier settings before changing GiftPort links.</p>}</section>
    <section className="mt-6 rounded-2xl border p-5"><h2 className="text-xl font-black">Link GiftPort brands</h2><p className="mt-2 text-sm text-slate-600">Choose the matching brand for each option. Face values must match the product option’s INR denomination.</p>{error ? <p role="alert" className="mt-4 text-red-700">{error} Reload this page before editing links.</p> : <div className="mt-5 space-y-5">{options.map(option => <fieldset key={option.id} disabled={locked}><GiftPortOptionEditor productId={product.id} option={option} mapping={mappings.find(m => m.option_id === option.id) || null} /></fieldset>)}{!options.length && <p>Add product options first, then return to link them.</p>}</div>}</section>
  </main></div></div>;
}
