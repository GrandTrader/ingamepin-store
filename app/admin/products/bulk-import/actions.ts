"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCatalogImport, validateCatalogSettings, type CatalogSettings } from "@/lib/catalog-import";
import { buildCatalogPlan, type CatalogSnapshot, type CatalogPlanItem } from "@/lib/catalog-import-plan";

export type ImportInput = { csv: string; mapping: Record<string, string>; categoryId: string; filename: string };
async function authorize() {
  const session = await createClient(); // Includes the existing administrator MFA check.
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw new Error("Sign in as an administrator.");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) throw new Error("Administrator access is required.");
  return { admin: createAdminClient(), user };
}
function message(error: unknown) { return error instanceof Error ? error.message : "Unable to complete this operation. Try again."; }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
function fingerprint(plan: unknown, settings: unknown) { return createHash("sha256").update(JSON.stringify(canonical({ plan, settings }))).digest("hex"); }
async function prepare(input: ImportInput) {
  const { admin, user } = await authorize();
  if (!input || typeof input.csv !== "string" || !input.mapping || typeof input.mapping !== "object" || Array.isArray(input.mapping) || Object.values(input.mapping).some(v => typeof v !== "string")) throw new Error("Invalid import request.");
  const settingsQuery = await admin.from("product_import_settings").select("markup_percent,inr_per_usd").eq("id", true).single();
  if (settingsQuery.error) throw new Error("Install the catalog import database update before using this page.");
  const settings: CatalogSettings = { markup_percent: String(settingsQuery.data.markup_percent), inr_per_usd: String(settingsQuery.data.inr_per_usd) };
  const parsed = parseCatalogImport(input.csv, input.mapping, settings);
  const categories = await admin.from("categories").select("id,name,slug,category_type").eq("is_active", true);
  if (categories.error) throw new Error("Unable to load categories.");
  const snapshots: Record<string, CatalogSnapshot | null> = {}, owners: Record<string, string> = {};
  // Keep PostgREST result sets below its default row limit.
  for (let offset = 0; offset < parsed.games.length; offset += 100) {
    const result = await admin.rpc("catalog_import_snapshots", { p_skus: parsed.games.slice(offset, offset + 100).map(g => g.parent_sku) });
    if (result.error) throw new Error("Unable to read product snapshots. Check the catalog database update.");
    for (const row of result.data || []) snapshots[row.sku] = row.snapshot;
  }
  const skus = parsed.games.flatMap(g => g.editions.map(e => e.sku));
  for (let offset = 0; offset < skus.length; offset += 100) {
    const result = await admin.from("product_options").select("catalog_sku,product_id").in("catalog_sku", skus.slice(offset, offset + 100));
    if (result.error) throw new Error("Unable to check edition SKUs.");
    for (const row of result.data || []) owners[row.catalog_sku] = row.product_id;
  }
  const prepared = buildCatalogPlan(input.csv, input.mapping, settings, categories.data || [], input.categoryId, snapshots, owners);
  const digest = fingerprint(prepared.plan, settings);
  return { ...prepared, digest, settings, admin, user };
}
export async function previewCatalog(input: ImportInput) {
  try {
    const p = await prepare(input);
    return { digest: p.digest, settings: p.settings, errors: p.errors, rowCount: p.rowCount, games: p.plan.map(g => ({ sku: g.parent_sku, title: g.product.name || String(g.expected?.product.name), action: g.expected ? "Update" : "Create draft", settings: { featured: (g.product.is_featured ?? String(g.expected?.product.is_featured ?? false)) === "true", affiliate: (g.product.affiliate_enabled ?? String(g.expected?.product.affiliate_enabled ?? false)) === "true", commission: g.product.affiliate_commission_percent ?? String(g.expected?.product.affiliate_commission_percent ?? 0) }, editions: g.editions })) };
  } catch (error) { return { error: message(error) }; }
}
export async function saveCatalogPricing(settings: CatalogSettings) {
  try {
    const { admin, user } = await authorize(); validateCatalogSettings(settings);
    const result = await admin.from("product_import_settings").update({ markup_percent: settings.markup_percent, inr_per_usd: settings.inr_per_usd, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", true).select("id").single();
    if (result.error) throw new Error("Unable to save pricing. Check the catalog database update.");
    return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function startCatalogImport(input: ImportInput, digest: string, requestId: string) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid import reference.");
    const { admin, user } = await authorize();
    // Recover a lost start response without inserting a second run.
    const existing = await admin.from("product_import_runs").select("id,created_by,settings,plan").eq("id", requestId).maybeSingle();
    if (existing.error) throw new Error("Unable to check the import reference.");
    if (existing.data) {
      const previous = fingerprint(existing.data.plan, existing.data.settings);
      if (existing.data.created_by !== user.id || previous !== digest) throw new Error("This import reference belongs to another preview.");
      return { id: requestId, count: (existing.data.plan as unknown[]).length };
    }
    const p = await prepare(input);
    if (p.digest !== digest) throw new Error("Products or pricing changed since preview. Preview again.");
    if (!p.plan.length) throw new Error("There are no valid products to import.");
    const result = await p.admin.from("product_import_runs").insert({ id: requestId, created_by: p.user.id, created_by_email: p.user.email || "Administrator", filename: String(input.filename || "catalog.csv").replace(/[\x00-\x1f]/g, "").slice(0, 160), settings: p.settings, plan: p.plan, rejected_rows: p.errors });
    if (result.error) throw new Error("Unable to start import. Retry with the same preview.");
    return { id: requestId, count: p.plan.length };
  } catch (error) { return { error: message(error) }; }
}
export async function processCatalogBatch(runId: string, offset: number, undo = false) {
  try {
    const { admin } = await authorize();
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid batch position.");
    const run = await admin.from("product_import_runs").select("plan,status").eq("id", runId).single();
    if (run.error) throw new Error("Import not found.");
    const count = (run.data.plan as CatalogPlanItem[]).length;
    const results: { sku: string; status: string; message?: string; productId?: string }[] = [];
    for (let i = offset; i < Math.min(offset + 5, count); i++) {
      const result = await admin.rpc(undo ? "undo_catalog_import_item" : "apply_catalog_import_item", { p_run: runId, p_index: i });
      if (result.error) throw new Error("Batch paused. Retry or resume this import from history.");
      results.push(result.data);
    }
    revalidatePath("/admin/products");
    return { results, next: Math.min(offset + 5, count), count };
  } catch (error) { return { error: message(error) }; }
}
export async function catalogHistory() {
  try {
    const { admin } = await authorize();
    const result = await admin.from("product_import_runs").select("id,filename,created_by_email,created_at,status").order("created_at", { ascending: false }).limit(30);
    if (result.error) throw new Error("Install the catalog import database update to view history.");
    return { runs: result.data };
  } catch (error) { return { error: message(error) }; }
}
export async function catalogRunDetails(runId: string) {
  try {
    const { admin } = await authorize();
    const [run, items] = await Promise.all([
      admin.from("product_import_runs").select("plan,rejected_rows,settings,status").eq("id", runId).single(),
      admin.from("product_import_items").select("parent_sku,status,message,before_snapshot,after_snapshot").eq("run_id", runId).order("item_index").range(0, 1999),
    ]);
    if (run.error || items.error) throw new Error("Unable to read import details.");
    const changes = items.data.map(item => {
      const before = item.before_snapshot as CatalogSnapshot | null, after = item.after_snapshot as CatalogSnapshot | null;
      const fields: { field: string; before: string; after: string }[] = [];
      for (const key of ["name", "name_ru", "slug", "description", "description_ru", "image_url", "category_id", "price", "requires_customer_details", "delivery_instructions", "is_featured", "affiliate_enabled", "affiliate_commission_percent"]) {
        if (before?.product[key] !== after?.product[key]) fields.push({ field: key, before: String(before?.product[key] ?? ""), after: String(after?.product[key] ?? "") });
      }
      for (const option of after?.options || []) {
        const old = before?.options.find(o => o.id === option.id);
        for (const key of ["option_name", "platform", "denomination", "selling_price", "catalog_source", "is_in_stock"]) if (JSON.stringify(old?.[key]) !== JSON.stringify(option[key])) fields.push({ field: `${option.catalog_sku}: ${key}`, before: JSON.stringify(old?.[key] ?? ""), after: JSON.stringify(option[key] ?? "") });
      }
      for (const field of after?.fields || []) if (!before?.fields.some(f => JSON.stringify(f) === JSON.stringify(field))) fields.push({ field: String(field.label), before: "", after: `${field.field_type}${field.is_required ? " · Required" : ""}` });
      return { sku: item.parent_sku, status: item.status, message: item.message, fields };
    });
    const databaseErrors = items.data.filter(i => i.status === "REJECTED").flatMap(item => {
      const game = (run.data.plan as CatalogPlanItem[]).find(g => g.parent_sku === item.parent_sku);
      return (game?.editions || []).map(e => ({ row: e.row, sku: e.sku, error: item.message || "Import rejected", values: { parent_sku: item.parent_sku, sku: e.sku, option_name: e.option_name, platform: e.platform, ...e.source } }));
    });
    return { count: (run.data.plan as unknown[]).length, errors: [...run.data.rejected_rows, ...databaseErrors], settings: run.data.settings, changes };
  } catch (error) { return { error: message(error) }; }
}
