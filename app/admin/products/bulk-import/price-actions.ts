"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPricePlan, parsePriceImport, PRICE_COLUMNS, type PriceSnapshot } from "@/lib/bulk-price-import";
import { catalogCsv } from "@/lib/catalog-import";
import { activePromotion, toIndiaInput, type ProductPromotion } from "@/lib/product-promotions";

type Input = { csv: string; filename: string };
const settings = { mode: "prices", version: 1 };
async function authorize() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw Error("Sign in as an administrator.");
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) throw Error("Administrator access is required.");
  return { admin: createAdminClient(), user };
}
const message = (e: unknown) => e instanceof Error ? e.message : "Unable to process the price upload.";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const fingerprint = (plan: unknown) => createHash("sha256").update(JSON.stringify(canonical({ plan, settings }))).digest("hex");
async function prepare(input: Input) {
  const auth = await authorize();
  if (!input || typeof input.csv !== "string") throw Error("Choose a CSV file.");
  const parsed = parsePriceImport(input.csv);
  const ids = [...new Set(parsed.rows.map(r => r.productId))], snapshots: Record<string, PriceSnapshot | null> = {};
  for (let offset = 0; offset < ids.length; offset += 50) {
    const result = await auth.admin.rpc("bulk_price_snapshots", { p_ids: ids.slice(offset, offset + 50) });
    if (result.error) throw Error("The bulk pricing database update must be installed before previewing prices.");
    for (const row of result.data || []) snapshots[row.id] = row.snapshot;
  }
  const plan = buildPricePlan(input.csv, snapshots);
  return { ...plan, ...auth, digest: fingerprint(plan.plan) };
}
export async function previewPriceImport(input: Input) {
  try {
    const p = await prepare(input);
    return { digest: p.digest, rows: p.preview, errors: p.errors, productCount: p.plan.length, rowCount: p.rowCount };
  } catch (e) { return { error: message(e) }; }
}
export async function startPriceImport(input: Input, digest: string, requestId: string) {
  try {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)) throw Error("Invalid import reference.");
    const { admin, user } = await authorize();
    const existing = await admin.from("product_import_runs").select("created_by,settings,plan").eq("id", requestId).maybeSingle();
    if (existing.error) throw Error("Unable to check this import reference.");
    if (existing.data) {
      if (existing.data.created_by !== user.id || existing.data.settings?.mode !== "prices" || fingerprint(existing.data.plan) !== digest) throw Error("This reference belongs to another preview.");
      return { id: requestId, count: (existing.data.plan as unknown[]).length };
    }
    const p = await prepare(input);
    if (p.errors.length) throw Error("Correct all rejected rows before importing prices.");
    if (!p.plan.length) throw Error("There are no price updates to import.");
    if (p.digest !== digest) throw Error("Prices or discounts changed after preview. Preview again.");
    const result = await p.admin.from("product_import_runs").insert({ id: requestId, created_by: p.user.id, created_by_email: p.user.email || "Administrator", filename: String(input.filename || "prices.csv").replace(/[\x00-\x1f]/g, "").slice(0, 160), settings, plan: p.plan, rejected_rows: [] });
    if (result.error) throw Error("Unable to start the price update. Retry with the same preview.");
    return { id: requestId, count: p.plan.length };
  } catch (e) { return { error: message(e) }; }
}
export async function exportExistingPrices() {
  try {
    const { admin } = await authorize();
    const records: (string | number)[][] = [];
    for (let offset = 0; ; offset += 400) {
      const result = await admin.from("product_options").select("id,product_id,option_name,selling_price,products!inner(name,currency)").eq("is_custom_value", false).order("product_id").order("id").range(offset, offset + 399);
      if (result.error) throw Error("Unable to export current product prices.");
      const ids = [...new Set(result.data.map(o => o.product_id))];
      if (!ids.length) break;
      const [promos, ranges, sellers] = await Promise.all([
        admin.from("product_promotions").select("product_id,revision,rules").in("product_id", ids),
        admin.from("product_range_settings").select("option_id").in("option_id", result.data.map(o => o.id)),
        admin.from("seller_product_submissions").select("product_id").in("product_id", ids),
      ]);
      if (promos.error || ranges.error || sellers.error) throw Error("Unable to read discount settings for this export.");
      for (const option of result.data) {
        const product = Array.isArray(option.products) ? option.products[0] : option.products;
        if (product.currency !== "USD" || ranges.data.some(r => r.option_id === option.id) || sellers.data.some(s => s.product_id === option.product_id)) continue;
        const rule = activePromotion((promos.data as ProductPromotion[]).find(p => p.product_id === option.product_id)?.rules, option.id);
        records.push([option.product_id, option.id, product.name, option.option_name, Number(option.selling_price).toFixed(2), rule?.percent ?? 0, toIndiaInput(rule?.endsAt ?? null).replace("T", " "), "", "", ""]);
      }
      if (result.data.length < 400) break;
      if (records.length > 2000) throw Error("The catalogue exceeds 2,000 options. Use a file containing only the products you want to update.");
    }
    if (records.length > 2000) throw Error("A price upload supports at most 2,000 options.");
    return { csv: catalogCsv(PRICE_COLUMNS, records), count: records.length };
  } catch (e) { return { error: message(e) }; }
}
