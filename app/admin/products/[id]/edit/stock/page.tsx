import ProductSettingsActions from "@/components/ProductSettingsActions";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ProductCodeStockManager from "./ProductCodeStockManager";
import { isUnlimitedStock } from "@/lib/product-stock";
import DigiSellerConnection from "./DigiSellerConnection";
import { supplierProductIds } from "@/lib/definiteplay-fulfillment";

export const dynamic = "force-dynamic";

export default async function ProductStockPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; connection?: string }>;
}) {
  const { id } = await params;
  const { success, error, connection } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  const admin = createAdminClient();
  const [productResult, optionsResult, codesResult] = await Promise.all([
    admin.from("products").select("id, name, slug, stock_quantity").eq("id", id).maybeSingle(),
    admin.from("product_options").select("id, option_name, denomination, denomination_currency, stock_quantity, digiseller_product_id, digiseller_option_id, digiseller_variant_id").eq("product_id", id).eq("is_active", true).eq("is_custom_value", false).order("sort_order"),
    admin.from("gift_card_codes").select("id, code, product_option_id, status, created_at").eq("product_id", id).order("created_at", { ascending: false }).limit(500),
  ]);
  if (productResult.error) throw new Error(`Unable to load product: ${productResult.error.message}`);
  if (!productResult.data) notFound();
  const product = productResult.data;
  const supplierEnabled=(await supplierProductIds([id])).has(id);

  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.slug}</p></div><ProductSettingsActions slug={product.slug}><Link href="/admin/products" className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold">← Product list</Link></ProductSettingsActions></header>
    {success && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}{error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="mt-8"><ProductEditPageTabs productId={id} current="stock" /></div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">{supplierEnabled ? <div><h2 className="text-xl font-black">Stock supplied by Definite Play</h2><span className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-400 px-3 py-1.5 text-xs font-black text-slate-950"><span aria-hidden="true">⚡</span>Instant Delivery</span><p className="mt-2">Availability is synced automatically. Codes are purchased after verified payment.</p><Link className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white" href={"/admin/products/"+id+"/edit/supplier"}>Manage supplier delivery</Link></div> : <ProductCodeStockManager productId={id} isUnlimited={isUnlimitedStock(product.stock_quantity)} options={(optionsResult.data ?? []).map((option) => ({ id: option.id, name: option.option_name, denomination: option.denomination === null ? null : Number(option.denomination), currency: option.denomination_currency, availableCount: Number(option.stock_quantity ?? 0) }))} codes={(codesResult.data ?? []).map((code) => ({ id: code.id, code: code.code, optionId: code.product_option_id, status: code.status as "AVAILABLE" | "RESERVED" | "SOLD" | "DISABLED", createdAt: code.created_at }))} />}</section>
    {connection === "digiseller" ? <Suspense fallback={<p role="status" className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Loading DigiSeller connection… You can add stock above.</p>}>
      <DigiSellerConnection productId={id} options={(optionsResult.data ?? []).map((option) => ({ id: option.id, name: option.option_name, digisellerProductId: option.digiseller_product_id === null ? null : Number(option.digiseller_product_id), digisellerOptionId: option.digiseller_option_id === null ? null : Number(option.digiseller_option_id), digisellerVariantId: option.digiseller_variant_id === null ? null : Number(option.digiseller_variant_id) }))} />
    </Suspense> : <section className="mt-6 rounded-xl border border-slate-200 p-4">
      <h2 className="font-bold">DigiSeller connection</h2>
      <p className="mt-1 text-sm text-slate-600">Optional settings for matching denominations with DigiSeller.</p>
      <Link href={`/admin/products/${id}/edit/stock?connection=digiseller`} prefetch={false} scroll={false} className="mt-3 inline-flex rounded-xl border border-blue-300 px-4 py-3 text-sm font-bold text-blue-700">Open DigiSeller settings</Link>
    </section>}

  </main></div></div>;
}
