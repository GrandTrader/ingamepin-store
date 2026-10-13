import "server-only";
import type { createAdminClient } from "./supabase/admin";
import { createAdminClient as adminClient } from "./supabase/admin";
import { getDigiSellerPurchaseSelection } from "./digiseller-api";
import { digiNetProceeds, digiRecipientInformation, resolveDigiSelection, type DigiFieldLink } from "./digiseller-customer-information";
import { fkDeliveryEnabled, processFKPurchase, type FKDeliveryJob, type FKDeliveryPayload, type FKPurchaseStore } from "./fkwallet-fulfillment";
import { requireCredentials } from "./fkwallet-storage";
type DB = ReturnType<typeof createAdminClient>;
type Purchase = Awaited<ReturnType<typeof getDigiSellerPurchaseSelection>>;
export type DigiFKJob = FKDeliveryJob & {
  invoice_id: number; digiseller_product_id: number; option_id: string;
  supplier_payload: FKDeliveryPayload & { digiFieldMap: DigiFieldLink[]; digiOptionId: number | null; digiVariantId: number | null };
};
async function call(db: DB, name: string, args: Record<string, unknown> = {}) {
  const result = await db.rpc(name, args);
  if (result.error) throw new Error("DigiSeller delivery state could not be saved.");
  return result.data;
}
export async function readDigiFKJob(db: DB, invoiceId: number): Promise<DigiFKJob | null> {
  const result = await db.from("digiseller_fkwallet_jobs").select("*").eq("invoice_id", invoiceId).maybeSingle();
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code)) return null;
    throw new Error("Delivery status could not be checked.");
  }
  return result.data as DigiFKJob | null;
}
export function verifyDigiFKPurchase(job: DigiFKJob, purchase: Purchase) {
  const net = digiNetProceeds(purchase), snapshot = job.supplier_payload;
  if (purchase.productId !== job.digiseller_product_id || purchase.quantity !== job.quantity
    || !resolveDigiSelection([{ id: job.option_id, product_id: "snapshot", digiseller_option_id: snapshot.digiOptionId, digiseller_variant_id: snapshot.digiVariantId }], purchase.options)) {
    throw new Error("Invoice selection changed.");
  }
  const information = digiRecipientInformation(snapshot.digiFieldMap, purchase.options);
  if (JSON.stringify(information) !== JSON.stringify(snapshot.customerInformation)) throw new Error("Invoice recipient changed.");
  return { net, information };
}
export async function queueDigiFKPurchase(db: DB, invoiceId: number, purchase: Purchase, option: { id: string; product_id: string }, existing?: DigiFKJob) {
  let information, net;
  if (existing) ({ information, net } = verifyDigiFKPurchase(existing, purchase));
  else {
    net = digiNetProceeds(purchase);
    const fields = await db.from("digiseller_fkwallet_products").select("field_map,ready").eq("product_id", option.product_id).eq("digiseller_product_id", purchase.productId).maybeSingle();
    if (fields.error || !fields.data?.ready) throw new Error("DigiSeller customer fields are not connected.");
    information = digiRecipientInformation(fields.data.field_map, purchase.options);
  }
  return call(db, "queue_digiseller_fkwallet_order", {
    p_invoice_id: invoiceId, p_digiseller_id: purchase.productId, p_option_id: option.id,
    p_quantity: purchase.quantity, p_net_usd: net, p_recipient: information,
  }) as Promise<string | null>;
}

export async function runDigiFKDeliveryTick(db: DB = adminClient()) {
  if (!fkDeliveryEnabled()) return { state: "disabled" };
  const claimed = await db.rpc("claim_digiseller_fkwallet_job");
  if (claimed.error) {
    if (["PGRST202", "42883"].includes(claimed.error.code)) return { state: "not_configured" };
    throw new Error("DigiSeller delivery queue is unavailable.");
  }
  const job = claimed.data as DigiFKJob | null;
  if (!job) return { state: "idle" };
  const args = { p_invoice_id: job.invoice_id, p_token: job.lease_token };
  const store: FKPurchaseStore = {
    async units() {
      const result = await db.from("digiseller_fkwallet_units").select("ordinal,request_key,submitted_at,provider_id,provider_status,result_ciphertext").eq("invoice_id", job.invoice_id).order("ordinal");
      if (result.error) throw new Error("DigiSeller purchase records are unavailable.");
      return result.data ?? [];
    },
    async hold(state, issue) { await call(db, "update_digiseller_fkwallet_job", { ...args, p_state: state, p_issue: issue }); },
    async mark(ordinal, request) { await call(db, "mark_digiseller_fkwallet_unit", { ...args, p_ordinal: ordinal, p_request: request }); },
    async record(ordinal, providerId, status, amount, result) { await call(db, "record_digiseller_fkwallet_unit", { ...args, p_ordinal: ordinal, p_provider_id: providerId, p_status: status, p_amount: amount, p_result: result }); },
    async complete(codes) { await call(db, "complete_digiseller_fkwallet_job", { ...args, p_codes: codes }); },
  };
  let purchase: Purchase;
  try { purchase = await getDigiSellerPurchaseSelection(job.invoice_id); }
  catch { await store.hold("UNCERTAIN", "DigiSeller payment could not be rechecked. No new purchase was made."); return { state: "waiting" }; }
  try {
    verifyDigiFKPurchase(job, purchase);
  } catch {
    await store.hold("REVIEW", "DigiSeller payment, denomination or recipient changed. Review this invoice before continuing.");
    return { state: "review" };
  }
  try {
    await queueDigiFKPurchase(db, job.invoice_id, purchase, { id: job.option_id, product_id: "snapshot" }, job);
    return { state: await processFKPurchase(await requireCredentials(), job, store) };
  } catch {
    await store.hold("UNCERTAIN", "Supplier check could not finish. The worker will check again without repeating a submitted purchase.");
    return { state: "waiting" };
  }
}
