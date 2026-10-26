import ProductSettingsActions from "@/components/ProductSettingsActions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminSidebar from "../../../../AdminSidebar";
import ProductEditPageTabs from "@/components/ProductEditPageTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ProductCodeStockManager from "./ProductCodeStockManager";
import { isUnlimitedStock } from "@/lib/product-stock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ProductStockPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; connection?: string; optionId?: string }>;
}) {
  const { id } = await params;
  const { success, error, connection, optionId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) redirect("/admin/login?error=Access denied");

  if (connection === "digiseller") {
    const messages = new URLSearchParams();
    if (success) messages.set("success", success);
    if (error) messages.set("error", error);
    redirect(`/admin/products/${id}/edit/digiseller${messages.size ? `?${messages}` : ""}`);
  }

  const admin = createAdminClient();
  const [productResult, optionsResult] = await Promise.all([
    admin.from("products").select("id, name, slug, stock_quantity, stock_source").eq("id", id).maybeSingle(),
    admin.from("product_options").select("id, option_name, denomination, denomination_currency, stock_quantity").eq("product_id", id).eq("is_active", true).eq("is_custom_value", false).order("sort_order"),
  ]);
  if (productResult.error) throw new Error(`Unable to load product: ${productResult.error.message}`);
  if (!productResult.data) notFound();
  if (optionsResult.error) throw new Error("Unable to load product options.");
  const product = productResult.data;
  const supplierEnabled=["DEFINITEPLAY", "FKWALLET", "WUPEX"].includes(product.stock_source);
  type BackupInventory = { optionId: string; enabled: boolean; uploadedOnly?: boolean; uploadedQuantity: number; supplierQuantity: number; availableQuantity: number };
  const inventory = supplierEnabled ? await admin.rpc("supplier_backup_inventory", { p_product_id: id }) : null;
  if (inventory?.error) throw new Error("Unable to load uploaded backup inventory. Apply the supplier backup database update.");
  const backupRows = new Map<string, BackupInventory>(((inventory?.data ?? []) as BackupInventory[]).map(row => [row.optionId, row]));
  const backupOptions = (optionsResult.data ?? []).filter(option => !supplierEnabled || backupRows.get(option.id)?.enabled);
  const stockManager = <ProductCodeStockManager productId={id} isUnlimited={!supplierEnabled && isUnlimitedStock(product.stock_quantity)}
    isSupplierBackup={supplierEnabled}
    options={backupOptions.map(option => ({
      id: option.id, name: option.option_name, denomination: option.denomination === null ? null : Number(option.denomination),
      currency: option.denomination_currency,
      availableCount: supplierEnabled ? Number(backupRows.get(option.id)?.uploadedQuantity ?? 0) : Number(option.stock_quantity ?? 0),
      uploadedOnly: !!backupRows.get(option.id)?.uploadedOnly,
      supplierAvailableCount: Number(backupRows.get(option.id)?.supplierQuantity ?? 0),
      publishedAvailableCount: Number(backupRows.get(option.id)?.availableQuantity ?? 0),
    }))} initialOptionId={optionId} revision={new Date().toISOString()} />;


  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Product settings</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-1 text-sm text-slate-500">{product.slug}</p></div><ProductSettingsActions slug={product.slug}><Link href="/admin/products" className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold">← Product list</Link></ProductSettingsActions></header>
    {success && <div data-editor-notice role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">{success}</div>}{error && <div data-editor-notice role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="mt-8"><ProductEditPageTabs productId={id} current="stock" /></div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {product.stock_source === "GIFTPORT" ? <p>This supplier is disconnected. New orders are disabled; existing orders require manual review.</p> : supplierEnabled ? <>
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-lg font-black">Supplier first · uploaded stock backup</h2>
          <p className="mt-2 text-sm">Stock supplied by {product.stock_source === "WUPEX" ? "Wupex" : product.stock_source === "FKWALLET" ? "FKWallet" : "Definite Play"}. After verified payment, uploaded codes for the same denomination are used when supplier stock cannot cover the order.</p>
          <p className="mt-2 text-sm text-slate-600">Denominations marked Uploaded stock only use your codes exclusively and keep their current prices. Each order item uses one source. Purchases already submitted to the supplier stay with that supplier.</p>
          <Link className="mt-3 inline-flex text-sm font-bold text-blue-600 underline" href={"/admin/products/"+id+"/edit/supplier"}>Manage supplier delivery</Link>
        </div>
        {backupOptions.length ? stockManager : <p className="text-sm text-slate-600">Uploaded backup stock supports fixed voucher denominations. Account top-ups and custom ranges use their existing delivery method.</p>}
      </> : stockManager}
    </section>


  </main></div></div>;
}
