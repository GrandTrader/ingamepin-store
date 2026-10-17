import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectionId, FKError, fkRequest, findFKOrderHistory, parseBalances, parseCurrencies, parseProducts, parseResult, type FKCredentials } from "./fkwallet-api";
import { fkCustomerFields, fkImportIssue } from "./fkwallet-import";
import { requireCredentials, seal, unseal } from "./fkwallet-storage";
import type { FKBalance, FKProduct, FKResult } from "./fkwallet-types";

type DB = ReturnType<typeof createAdminClient>;
export type FKDeliveryPayload = {
  connectionId: string; categoryId: number; productId: number; supplierCost: number; currency: string;
  exchangeRate: number; deliveryKind: "CODE" | "ACCOUNT";
  fieldMap: { key: string; fieldId: string; fieldType: string }[];
  customerInformation: { fieldId: string; value: string }[];
};
export type FKDeliveryJob = { item_id: string; order_id: string; lease_token: string; quantity: number; created_at: string; supplier_payload: FKDeliveryPayload };
type Unit = { ordinal: number; request_key: string; submitted_at: string | null; provider_id: string | null; provider_status: string | null; result_ciphertext: string | null };
export const fkDeliveryEnabled = () => process.env.FKWALLET_FULFILLMENT_ENABLED?.trim() === "true";
const binding = (id: string, ordinal: number) => `fkwallet:auto:${id}:${ordinal}`;
async function rpc(db: DB, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) throw new FKError("FKWallet delivery could not save its state. The order needs another status check.");
  return result.data;
}

export function fkDeliveryFields(payload: FKDeliveryPayload, product: FKProduct) {
  if (fkImportIssue(product) || product.id !== payload.productId || product.currency !== payload.currency || product.price > Number(payload.supplierCost)) throw new FKError("Supplier product or price changed. Review the order before purchasing.");
  const fields = fkCustomerFields(product);
  if (!Array.isArray(payload.fieldMap) || !Array.isArray(payload.customerInformation) || fields.length !== payload.fieldMap.length) throw new FKError("The supplier recipient form changed. Review this order.");
  return fields.map(field => {
    const mapping = payload.fieldMap.filter(row => row.key === field.key && row.fieldType === field.fieldType);
    if (mapping.length !== 1) throw new FKError("The supplier recipient form changed. Review this order.");
    const entries = payload.customerInformation.filter(row => row.fieldId === mapping[0].fieldId);
    if (entries.length !== 1 || typeof entries[0].value !== "string" || !entries[0].value.trim() || entries[0].value.length > 2000 || entries[0].value.startsWith("[Protected")) throw new FKError("Required customer delivery details are missing.");
    return { key: field.key, value: entries[0].value.trim() };
  });
}

async function hold(db: DB, job: FKDeliveryJob, state: string, issue: string) {
  await rpc(db, "update_definiteplay_job", { p_item_id: job.item_id, p_token: job.lease_token, p_state: state, p_issue: issue });
}

// Each tick handles one unit. The database records intent before POST, and an
// ambiguous request is never POSTed again, even with the same idempotence key.
export type FKPurchaseStore = {
  units(): Promise<Unit[]>;
  hold(state: string, issue: string): Promise<void>;
  mark(ordinal: number, request: string): Promise<void>;
  record(ordinal: number, providerId: string, status: string, amount: number | null, result: string): Promise<void>;
  complete(codes: string[]): Promise<void>;
};
export async function processFKDelivery(db: DB, credentials: FKCredentials, job: FKDeliveryJob): Promise<string> {
  const args = { p_item_id: job.item_id, p_token: job.lease_token };
  return processFKPurchase(credentials, job, {
    async units() {
      const read = await db.from("fkwallet_units").select("ordinal,request_key,submitted_at,provider_id,provider_status,result_ciphertext").eq("item_id", job.item_id).order("ordinal");
      if (read.error) throw new FKError("Supplier purchase records are incomplete.");
      return (read.data ?? []) as Unit[];
    },
    hold: (state, issue) => hold(db, job, state, issue),
    async mark(ordinal, request) { await rpc(db, "mark_fkwallet_unit_submitted", { ...args, p_ordinal: ordinal, p_request: request }); },
    async record(ordinal, providerId, status, amount, result) { await rpc(db, "record_fkwallet_unit", { ...args, p_ordinal: ordinal, p_provider_id: providerId, p_status: status, p_amount: amount, p_result: result }); },
    async complete(codes) { await rpc(db, "complete_fkwallet_job", { ...args, p_codes: codes }); },
  });
}

export async function processFKPurchase(credentials: FKCredentials, job: FKDeliveryJob, store: FKPurchaseStore): Promise<string> {
  const payload = job.supplier_payload;
  if (payload.connectionId !== connectionId(credentials)) { await store.hold( "REVIEW", "FKWallet account changed. Reconcile this order using its original account."); return "review"; }
  const units = await store.units();
  if (units.length !== job.quantity) throw new FKError("Supplier purchase records are incomplete.");
  const unit = units.find(row => row.provider_status !== "success");
  if (!unit) {
    const codes = payload.deliveryKind === "CODE" ? units.map(row => {
      if (!row.result_ciphertext) throw new FKError("A delivered code is missing. Review this order.");
      const result = unseal<FKResult>(row.result_ciphertext, binding(job.item_id, row.ordinal));
      if (!result.couponCode?.trim() || result.id !== row.provider_id) throw new FKError("A delivered code is missing. Review this order.");
      return result.couponCode.trim();
    }) : [];
    await store.complete(codes);
    return "delivered";
  }
  if (!unit.submitted_at) {
    let attempted = false;
    try {
      const [products, currencies, balances] = await Promise.all([
        fkRequest(credentials, `op/categories/${payload.categoryId}/products`).then(parseProducts),
        fkRequest(credentials, "currencies").then(parseCurrencies),
        fkRequest(credentials, "balance").then(parseBalances),
      ]);
      const product = products.find(row => row.id === payload.productId);
      if (!product) throw new FKError("Supplier product is unavailable. Review this order.");
      const fields = fkDeliveryFields(payload, product);
      const currency = currencies.find(row => row.code === payload.currency);
      const balance = balances.find(row => row.currency === payload.currency);
      if (!currency || !balance) throw new FKError("Supplier currency could not be matched. Review this order.");
      if (balance.value < product.price) throw new FKError("Supplier balance is insufficient. Delivery will retry after FKWallet is topped up.");
      const body = { online_product_id: product.id, currency_id: currency.id, fields, idempotence_key: unit.request_key };
      await fkRequest(credentials, "op/validate", { ...body, idempotence_key: `check-${unit.request_key}` });
      await store.mark(unit.ordinal, seal(body, `${binding(job.item_id, unit.ordinal)}:request`));
      attempted = true;
      const result = parseResult(await fkRequest(credentials, "op/create", body));
      await store.record(unit.ordinal, result.id, "unknown", null, seal(result, binding(job.item_id, unit.ordinal)));
      await store.hold( "WAITING", "Purchase submitted. Waiting for FKWallet delivery confirmation.");
      return "submitted";
    } catch (error) {
      const message = error instanceof FKError ? error.message : "Supplier preflight failed. Review before purchasing.";
      const retryCheck = !attempted && /balance is insufficient|could not be reached|request failed \(HTTP (429|5\d\d)\)/.test(message);
      await store.hold( retryCheck ? "WAITING" : "REVIEW", attempted ? "Supplier submission outcome is unconfirmed. Check FKWallet; do not buy again." : message);
      return retryCheck ? "waiting" : "review";
    }
  }
  if (!unit.provider_id) {
    await store.hold( "REVIEW", "No supplier order ID was saved. Reconcile the original request in FKWallet; do not submit again."); return "review";
  }
  const history = await findFKOrderHistory(credentials, unit.provider_id, unit.submitted_at);
  if (!history || history.status === "in_process" || history.status === "unknown") {
    await store.hold( Date.now() - Date.parse(unit.submitted_at) > 86400000 ? "REVIEW" : "WAITING", "Awaiting a confirmed status from FKWallet purchase history."); return "waiting";
  }
  if (history.status !== "success") {
    await store.hold( "REVIEW", `FKWallet reports ${history.status}. Review the supplier charge and customer refund.`); return "review";
  }
  if (history.currency !== payload.currency || history.amount > Number(payload.supplierCost)) {
    await store.hold( "REVIEW", "Supplier charge or currency does not match the approved purchase."); return "review";
  }
  const result = parseResult(await fkRequest(credentials, `op/status/${unit.provider_id}`));
  if (result.id !== unit.provider_id) throw new FKError("Supplier returned a different order.");
  if (payload.deliveryKind === "CODE" && !result.couponCode?.trim()) {
    await store.hold( "REVIEW", "FKWallet confirmed the purchase but returned no code. Check the supplier result."); return "review";
  }
  await store.record(unit.ordinal, result.id, "success", history.amount, seal(result, binding(job.item_id, unit.ordinal)));
  // Complete immediately if this is the last unit; otherwise release the lease.
  if (units.every(row => row.ordinal === unit.ordinal || row.provider_status === "success")) return processFKPurchase(credentials, job, store);
  await store.hold( "WAITING", "Unit delivered. Remaining units are queued."); return "waiting";
}

// A refresh owns one balance snapshot and one catalogue read per category.
// Never share these across ticks/accounts, or with a paid purchase preflight.
export function createFKStockReader(credentials: FKCredentials) {
  let balances: Promise<FKBalance[]> | undefined;
  const catalogues = new Map<number, Promise<FKProduct[]>>();
  async function read(endpoint: string) {
    for (let attempt = 0; ; attempt++) {
      try { return await fkRequest(credentials, endpoint); }
      catch (error) {
        const retryable = error instanceof FKError && (error.httpStatus === 429
          || (error.httpStatus !== undefined && error.httpStatus >= 500)
          || error.message === "FKWallet could not be reached or returned an invalid response.");
        const wait = error instanceof FKError ? error.retryAfterMs ?? 1000 * 2 ** attempt : 0;
        // Respect long provider cooldowns by failing this refresh, not retrying early.
        if (!retryable || attempt >= 2 || wait > 5000) throw error;
        await delay(Math.max(1000, wait));
      }
    }
  }
  return {
    connection: connectionId(credentials),
    balances: () => balances ??= read("balance").then(parseBalances),
    products(categoryId: number) {
      if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new FKError("Supplier category is invalid.");
      let catalogue = catalogues.get(categoryId);
      if (!catalogue) {
        catalogue = read(`op/categories/${categoryId}/products`).then(parseProducts);
        catalogues.set(categoryId, catalogue);
      }
      return catalogue;
    },
  };
}

export async function syncFKProductStock(db: DB, credentials: FKCredentials, productId: string,
  reader = createFKStockReader(credentials)) {
  const [imported, links] = await Promise.all([
    db.from("fkwallet_imports").select("connection_id,supplier_category_id,customer_fields").eq("product_id", productId).single(),
    db.from("fkwallet_product_links").select("option_id,supplier_product_id,supplier_cost,supplier_currency").eq("product_id", productId),
  ]);
  if (imported.error || links.error) throw new FKError("Supplier links are unavailable.");
  const imp = imported.data;
  if (imp.connection_id !== connectionId(credentials)) throw new FKError("The FKWallet connection has changed.");
  if (reader.connection !== imp.connection_id) throw new FKError("The FKWallet connection has changed.");
  let stock: { optionId: string; quantity: number }[] = [];
  let failure: unknown;
  try {
    const [products, balances] = await Promise.all([
      reader.products(Number(imp.supplier_category_id)),
      reader.balances(),
    ]);
    stock = (links.data ?? []).map(link => {
      const product = products.find(row => row.id === Number(link.supplier_product_id));
      let valid = !!product && !fkImportIssue(product) && product.currency === link.supplier_currency && product.price <= Number(link.supplier_cost);
      if (valid && product) {
        const fields = fkCustomerFields(product);
        valid = fields.length === imp.customer_fields.length && fields.every(field => imp.customer_fields.some((saved: { key: string; fieldType: string }) => saved.key === field.key && saved.fieldType === field.fieldType));
      }
      const funds = product ? balances.find(row => row.currency === product.currency)?.value ?? 0 : 0;
      // This is funded order capacity, not a count of codes held in stock.
      return { optionId: link.option_id, quantity: valid && product ? Math.max(0, Math.min(1000, Math.floor(funds / product.price))) : 0 };
    });
  } catch (error) { failure = error; }
  // Unknown availability stays closed, but it must not be reported as a successful refresh.
  await rpc(db, "sync_fkwallet_stock", { p_product_id: productId, p_connection: imp.connection_id, p_rows: stock });
  if (failure) throw failure;
}

export async function runFKDeliveryTick() {
  if (!fkDeliveryEnabled()) throw new FKError("FKWallet automatic delivery is not enabled on this server.");
  const db = createAdminClient(), credentials = await requireCredentials();
  // Confirm authentication before advertising a healthy worker.
  let stockReader = createFKStockReader(credentials);
  await stockReader.balances();
  const heartbeat = await db.from("fkwallet_worker_state").upsert({ id: true, connection_id: connectionId(credentials), seen_at: new Date().toISOString() });
  if (heartbeat.error) throw new FKError("Install the FKWallet delivery database update first.");
  const job = await rpc(db, "claim_supplier_job", { p_provider: "FKWALLET" }) as FKDeliveryJob | null;
  let state = "idle";
  if (job) {
    try { state = await processFKDelivery(db, credentials, job); }
    catch { await hold(db, job, "UNCERTAIN", "Supplier status check could not finish. The worker will check again without repeating the purchase."); state = "waiting"; }
  }
  // A delivery may have spent funds: do not reuse the pre-delivery balance then.
  if (job) stockReader = createFKStockReader(credentials);
  const settings = await db.from("fkwallet_delivery_settings").select("product_id").lt("stock_synced_at", new Date(Date.now() - 5 * 60000).toISOString()).order("stock_synced_at").limit(20);
  if (settings.error) throw new FKError("Supplier stock settings could not be read.");
  const stock = await Promise.allSettled((settings.data ?? []).map(row => syncFKProductStock(db, credentials, row.product_id, stockReader)));
  stock.forEach((result, index) => {
    if (result.status === "rejected") console.warn("FKWallet stock refresh failed", {
      productId: settings.data?.[index].product_id,
      reason: result.reason instanceof FKError ? result.reason.message : "Stock refresh could not complete.",
    });
  });
  return { state, stockUpdated: stock.filter(row => row.status === "fulfilled").length, stockFailed: stock.filter(row => row.status === "rejected").length };
}
