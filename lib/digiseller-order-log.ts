import type { SupabaseClient } from "@supabase/supabase-js";

export type DigiSellerLogSource = "stock" | "definiteplay" | "fkwallet";
export type DigiSellerLogRow = {
  invoiceId: string; digiProductId: string; source: DigiSellerLogSource;
  optionName: string; quantity: number; state: string; date: string;
};
export type DigiSellerLogPage = { rows: DigiSellerLogRow[]; next: string | null };
export type DigiSellerLogFilter = { before?: string; invoice?: string; deliveredOnly?: boolean };
const PAGE_SIZE = 25;
const sources = [
  { source: "stock", table: "digiseller_deliveries", relation: "gift_card_codes", fields: "delivered_at,gift_card_codes!inner(product_id,product_options(option_name))" },
  { source: "definiteplay", table: "digiseller_supplier_jobs", relation: "product_options", fields: "quantity,state,created_at,product_options!inner(product_id,option_name)" },
  { source: "fkwallet", table: "digiseller_fkwallet_jobs", relation: "product_options", fields: "quantity,state,created_at,product_options!inner(product_id,option_name)" },
] as const;

export function validDigiSellerInvoice(value: string) {
  return /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
}
export function isDigiSellerLogSource(value: string): value is DigiSellerLogSource {
  return sources.some(entry => entry.source === value);
}

type Option = { option_name: string | null };
type StoredRow = {
  invoice_id: number; digiseller_product_id: number; quantity?: number; state?: string;
  delivered_at?: string; created_at?: string;
  gift_card_codes?: { product_options: Option | Option[] | null } | { product_options: Option | Option[] | null }[];
  product_options?: Option | Option[] | null;
};
function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export async function readDigiSellerOrderLog(db: SupabaseClient, productId: string, filter: DigiSellerLogFilter = {}): Promise<DigiSellerLogPage> {
  const groups = await Promise.all(sources.map(async source => {
    // Product ownership comes from the original stock/option, never today's DigiSeller mapping.
    // Do not select goods in a list response: invoices may contain hundreds of voucher codes.
    let query = db.from(source.table).select("invoice_id,digiseller_product_id," + source.fields)
      .eq(source.relation + ".product_id", productId);
    if (filter.invoice) query = query.eq("invoice_id", filter.invoice);
    if (filter.before) query = query.lt("invoice_id", filter.before);
    if (filter.deliveredOnly && source.source !== "stock") query = query.eq("state", "DELIVERED");
    const result = await query.order("invoice_id", { ascending: false }).limit(PAGE_SIZE + 1);
    if (result.error) throw new Error("Unable to load DigiSeller orders. Please retry.");
    return (result.data as unknown as StoredRow[] ?? []).map(row => ({
      invoiceId: String(row.invoice_id), digiProductId: String(row.digiseller_product_id),
      source: source.source, optionName: (source.source === "stock"
        ? one(one(row.gift_card_codes)?.product_options) : one(row.product_options))?.option_name || "Denomination unavailable",
      quantity: source.source === "stock" ? 1 : row.quantity ?? 0,
      state: source.source === "stock" ? "DELIVERED" : row.state ?? "QUEUED",
      date: (source.source === "stock" ? row.delivered_at : row.created_at) ?? "",
    }));
  }));
  // Invoice IDs are unique across all fulfilment sources and give a stable cursor even
  // when a pending supplier job changes status while the administrator browses.
  const sorted = groups.flat().sort((a, b) => Number(b.invoiceId) - Number(a.invoiceId));
  const rows = sorted.slice(0, PAGE_SIZE);
  return { rows, next: sorted.length > PAGE_SIZE ? rows.at(-1)!.invoiceId : null };
}

export async function readDigiSellerDeliveredContent(db: SupabaseClient, productId: string, sourceName: DigiSellerLogSource, invoice: string): Promise<string | null> {
  const source = sources.find(entry => entry.source === sourceName)!;
  let query = db.from(source.table).select("goods," + source.relation + "!inner(product_id)")
    .eq(source.relation + ".product_id", productId).eq("invoice_id", invoice);
  if (source.source !== "stock") query = query.eq("state", "DELIVERED");
  const result = await query.maybeSingle();
  if (result.error) throw new Error("Unable to load delivered content. Please retry.");
  const row = result.data as unknown as { goods: string | null } | null;
  return row ? String(row.goods ?? "") : null;
}
