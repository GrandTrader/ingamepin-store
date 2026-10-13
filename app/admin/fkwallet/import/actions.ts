"use server";

import { revalidatePath } from "next/cache";
import { requireFKAdmin } from "@/lib/fkwallet-admin";
import { connectionId, FKError, fkRequest, parseProducts } from "@/lib/fkwallet-api";
import { requireCredentials } from "@/lib/fkwallet-storage";
import { fkUuid, prepareFKDraft, type FKImportInput } from "@/lib/fkwallet-import";
import type { FKAction, FKImportedProduct } from "@/lib/fkwallet-types";

export async function loadFKImports(page: number): Promise<FKAction<{ products: FKImportedProduct[]; total: number }>> {
  const { db } = await requireFKAdmin();
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return { error: "Choose a valid page." };
  try {
    const account = connectionId(await requireCredentials());
    const result = await db.from("fkwallet_imports").select("product_id,markup_percent,exchange_rate,created_at,products(name,status)", { count: "exact" })
      .eq("connection_id", account).order("created_at", { ascending: false }).order("product_id").range((page - 1) * 20, page * 20 - 1);
    if (result.error) return { error: "The FKWallet import database update must be installed to view saved imports." };
    return { data: { total: result.count ?? 0, products: (result.data ?? []).map(row => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      return { productId: row.product_id, name: product?.name ?? "Product", status: product?.status ?? "Unknown", markup: Number(row.markup_percent), exchangeRate: Number(row.exchange_rate), createdAt: row.created_at };
    }) } };
  } catch (error) { return { error: error instanceof FKError ? error.message : "Imported products could not be loaded." }; }
}

export async function importFKProduct(input: FKImportInput): Promise<{ productId?: string; error?: string; replayed?: boolean }> {
  const { db, userId } = await requireFKAdmin();
  if (!input || !fkUuid(input.requestId) || !fkUuid(input.categoryId) || !Number.isSafeInteger(input.supplierCategoryId) || input.supplierCategoryId <= 0) return { error: "Choose a valid website category and supplier selection." };
  try {
    const credentials = await requireCredentials(), account = connectionId(credentials);
    if (input.connectionId !== account) return { error: "The FKWallet account changed. Reload the import page." };
    // Check the stable request reference before consulting the live catalogue.
    // A committed draft remains recoverable if the supplier goes offline.
    const previous = await db.from("fkwallet_imports").select("product_id,connection_id,imported_by").eq("product_id", input.requestId).maybeSingle();
    if (previous.error) return { error: "Install the FKWallet import database update before importing products." };
    if (previous.data) return previous.data.connection_id === account && previous.data.imported_by === userId
      ? { productId: previous.data.product_id, replayed: true } : { error: "This import reference is already used. Reload the page." };
    const products = parseProducts(await fkRequest(credentials, `op/categories/${input.supplierCategoryId}/products`));
    let draft;
    try { draft = prepareFKDraft(input, products); }
    catch (error) { return { error: error instanceof Error ? error.message : "Check the import details." }; }
    if (draft.customerFields?.length) {
      const setup = await db.from("fkwallet_imports").select("customer_fields").limit(1);
      if (setup.error) return { error: "Install the FKWallet customer fields database update before importing these products." };
    }
    const result = await db.rpc("import_fkwallet_draft", { p_product_id: input.requestId, p_category_id: input.categoryId,
      p_connection_id: account, p_supplier_category_id: input.supplierCategoryId, p_admin_id: userId, p_draft: draft });
    if (result.error) {
      if (result.error.code === "23505") return { error: "A selected supplier product has already been imported. Check Imported products before creating another draft." };
      if (result.error.code === "PGRST202") return { error: "Install the FKWallet import database update first." };
      return { error: "The draft could not be confirmed. Retry on this page to check the same import." };
    }
    if (result.data?.productId !== input.requestId) return { error: "The import result could not be confirmed. Retry on this page." };
    revalidatePath("/admin/products"); revalidatePath("/admin/fkwallet");
    return { productId: result.data.productId, replayed: result.data.replayed === true };
  } catch (error) { return { error: error instanceof FKError ? error.message : "The import could not finish. Retry on this page to check the same draft." }; }
}
