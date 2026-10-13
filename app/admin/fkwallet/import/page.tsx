import { randomUUID } from "node:crypto";
import Link from "next/link";
import AdminSidebar from "../../AdminSidebar";
import { requireFKAdmin } from "@/lib/fkwallet-admin";
import { connectionId, FKError, fkRequest, parseProducts, positiveId } from "@/lib/fkwallet-api";
import { requireCredentials } from "@/lib/fkwallet-storage";
import { fkCustomerFields, fkImportIssue, parseFKSelection } from "@/lib/fkwallet-import";
import FKImportForm from "./FKImportForm";
import type { FKProduct } from "@/lib/fkwallet-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import FKWallet products | InGamePin Admin" };

export default async function FKImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { db } = await requireFKAdmin();
  const query = await searchParams;
  let error = "", ready = false, account = "", supplierCategoryId = 0;
  let items: FKProduct[] = [], categories: { id: string; name: string }[] = [];
  let imported: { product_id: string; supplier_product_id: number }[] = [];
  try {
    const ids = parseFKSelection(query.items);
    supplierCategoryId = positiveId(query.category);
    const credentials = await requireCredentials(); account = connectionId(credentials);
    const [catalogue, website, links] = await Promise.all([
      fkRequest(credentials, `op/categories/${supplierCategoryId}/products`).then(parseProducts),
      db.from("categories").select("id,name").eq("is_active", true).in("category_type", ["GIFT_CARD", "GAME_KEY", "SUBSCRIPTION", "DIGITAL_PRODUCT", "GAME_TOPUP"]).order("name"),
      db.from("fkwallet_product_links").select("product_id,supplier_product_id").eq("connection_id", account).in("supplier_product_id", ids),
    ]);
    if (website.error) throw new Error("Website categories could not be loaded.");
    categories = website.data ?? [];
    if (links.error && !["42P01", "PGRST205"].includes(links.error.code)) throw new Error("Previous imports could not be checked. Reload the page.");
    ready = !links.error; imported = links.data ?? [];
    items = ids.map(id => { const item = catalogue.find(p => p.id === id); if (!item) throw new Error("A selected product is no longer available. Return to the catalogue."); return item; });
    const issue = items.map(fkImportIssue).find(Boolean); if (issue) throw new Error(issue);
    const fieldSchema = JSON.stringify(fkCustomerFields(items[0]));
    if (items.some(item => JSON.stringify(fkCustomerFields(item)) !== fieldSchema)) throw new Error("These products need different customer information. Import them separately.");
    if (items.some(item => item.fields.length)) {
      const fieldsSetup = await db.from("fkwallet_imports").select("customer_fields").limit(1);
      if (fieldsSetup.error && !["42P01", "42703", "PGRST204", "PGRST205"].includes(fieldsSetup.error.code)) throw new Error("Customer field setup could not be checked. Reload the page.");
      ready = ready && !fieldsSetup.error;
    }
    if (new Set(items.map(p => p.currency)).size !== 1) throw new Error("Select products with the same supplier currency.");
  } catch (cause) { error = cause instanceof FKError || cause instanceof Error ? cause.message : "The import could not be loaded."; }
  return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row"><AdminSidebar />
    <main className="min-w-0 flex-1 p-4 sm:p-8">
      <Link href="/admin/fkwallet" className="text-sm font-bold text-blue-600">← FKWallet catalogue</Link>
      <h1 className="mt-4 text-3xl font-black">Import FKWallet product</h1>
      <p className="mt-2 text-slate-600">Choose your prices and save the selected denominations as one draft product.</p>
      {error ? <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p> : imported.length ?
        <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="font-bold">Some selected items are already imported</h2><p className="mt-2 text-sm">Review the existing products, or return to the catalogue and select only new items.</p>
          {[...new Set(imported.map(p => p.product_id))].map(id => <Link key={id} className="mt-3 block text-blue-600 underline" href={`/admin/products/${id}/edit/general`}>Review existing product</Link>)}
        </section> : <FKImportForm items={items} categories={categories} requestId={randomUUID()} connectionId={account} supplierCategoryId={supplierCategoryId} databaseReady={ready} />}
    </main></div></div>;
}
