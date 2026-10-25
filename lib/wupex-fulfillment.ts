import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWupexProducts, getWupexBalance, getWupexFields, getWupexOrder, getWupexServers, submitWupexUnit, wupexConnectionId, WUPEX_SANDBOX_URL, WupexError, type WupexOrder } from "./wupex-api";
import { readWupexCredentials, sealWupex, unsealWupex } from "./wupex-storage";
import type { WupexCredentials, WupexProduct } from "./wupex-types";
type DB = ReturnType<typeof createAdminClient>;
export const wupexDeliveryEnabled = () => process.env.WUPEX_FULFILLMENT_ENABLED?.trim() === "true";
export type WupexPayload = {
 connectionId: string; productId: number; productName: string; sku: string; cardType: "voucher" | "topup"; subType: number | null;
 supplierCost: number; currency: string; exchangeRate: number; deliveryKind: "CODE" | "ACCOUNT";
 fieldMap: { key: string; fieldId: string; fieldType: string }[];
 customerInformation: { fieldId: string; value: string }[];
};
export type WupexJob = { item_id: string; order_id: string; lease_token: string; quantity: number; supplier_payload: WupexPayload };
type Unit = { ordinal: number; request_key: string; submitted_at: string | null; provider_id: string | null; provider_status: string | null; result_ciphertext: string | null };
export type WupexStore = {
 units(): Promise<Unit[]>; hold(state: string, issue: string): Promise<void>;
 mark(ordinal: number, request: string): Promise<void>;
 record(ordinal: number, providerId: string, status: string, amount: number | null, result: string): Promise<void>;
 complete(codes: string[]): Promise<void>;
};
const binding = (item: string, ordinal: number) => "wupex:auto:" + item + ":" + ordinal;
export function assertWupexLive(credentials: WupexCredentials) {
 if (credentials.baseUrl === WUPEX_SANDBOX_URL || /sandbox|test|staging/i.test(new URL(credentials.baseUrl).hostname)) throw new WupexError("Sandbox products cannot fulfil live customer orders. Connect the production account first.");
}
async function rpc(db: DB, name: string, args: Record<string, unknown>) {
 const result = await db.rpc(name, args);
 if (result.error) throw new WupexError("Wupex delivery state could not be saved. The original purchase will be checked again.");
 return result.data;
}
export async function wupexRecipient(credentials: WupexCredentials, payload: WupexPayload, product: WupexProduct) {
 if (product.id !== payload.productId || product.sku !== payload.sku || product.cardType !== payload.cardType || product.subType !== payload.subType ||
     product.price <= 0 || product.price > Number(payload.supplierCost) || payload.currency !== "USD" || Number(payload.exchangeRate) !== 1 ||
     payload.deliveryKind !== (product.cardType === "voucher" ? "CODE" : "ACCOUNT")) throw new WupexError("Supplier product or price changed. Review this order before buying.");
 const fields = await getWupexFields(credentials, product), values: Record<string, string> = {};
 if (!Array.isArray(payload.fieldMap) || !Array.isArray(payload.customerInformation) || fields.length !== payload.fieldMap.length) throw new WupexError("The recipient form changed. Review this order.");
 for (const field of fields) {
  const map = payload.fieldMap.filter(f => f.key === field.key && f.fieldType === field.fieldType);
  const entries = map.length === 1 ? payload.customerInformation.filter(f => f.fieldId === map[0].fieldId) : [];
  if (entries.length !== 1 || typeof entries[0].value !== "string" || !entries[0].value.trim() || entries[0].value.length > 2000 || entries[0].value.startsWith("[Protected")) throw new WupexError("Required recipient details are missing.");
  values[field.key] = entries[0].value.trim();
 }
 if (values.serverId && !(await getWupexServers(credentials, product.sku)).some(s => s.id === values.serverId)) throw new WupexError("The selected server ID is invalid.");
 return product.cardType === "voucher" ? null : product.subType === 5
  ? { attributes: Object.entries(values).map(([key, value]) => ({ attribute_id: Number(key.slice("attribute_".length)), value })) }
  : { userAccount: values };
}
export function validateWupexDelivery(order: WupexOrder, payload: WupexPayload, reference: string, providerId: string | null) {
 if ((providerId && order.orderName !== providerId) || (order.reference !== null && order.reference !== reference) || order.total !== 1 ||
     order.skus.some(sku => sku !== payload.sku) || order.codes.some(code => code.sku !== payload.sku)) throw new WupexError("Wupex returned a different order or denomination. Review the supplier purchase.");
 if (order.status === "FAILED") throw new WupexError("Wupex reports a failed purchase. Review its charge before refunding; do not buy again.");
 if (order.status !== "COMPLETED" || order.delivered !== 1 || order.remaining !== 0) return false;
 if (!order.skus.length || order.amount <= 0 || order.amount > Number(payload.supplierCost) ||
     (payload.deliveryKind === "CODE" && order.codes.length !== 1) || (payload.deliveryKind === "ACCOUNT" && order.codes.length !== 0)) throw new WupexError("Wupex delivery or charge is incomplete. Review the original purchase.");
 return true;
}
export async function processWupexPurchase(credentials: WupexCredentials, job: WupexJob, store: WupexStore): Promise<string> {
 assertWupexLive(credentials);
 const payload = job.supplier_payload;
 if (payload.connectionId !== wupexConnectionId(credentials)) { await store.hold("REVIEW", "Wupex account changed. Reconcile using the original account."); return "review"; }
 const units = await store.units();
 if (units.length !== job.quantity || new Set(units.map(u => u.ordinal)).size !== job.quantity) throw new WupexError("Supplier purchase records are incomplete.");
 const unit = units.find(u => u.provider_status !== "success");
 if (!unit) {
  const codes = payload.deliveryKind === "CODE" ? units.map(u => {
   if (!u.result_ciphertext) throw new WupexError("A delivered code is missing.");
   const order = unsealWupex<WupexOrder>(u.result_ciphertext, binding(job.item_id, u.ordinal));
   if (!validateWupexDelivery(order, payload, u.request_key, u.provider_id)) throw new WupexError("Supplier result is not final.");
   return order.codes[0].code;
  }) : [];
  await store.complete(codes); return "delivered";
 }
 let providerId = unit.provider_id;
 if (!unit.submitted_at) {
  let marked = false;
  try {
   const [products, balance] = await Promise.all([findWupexProducts(credentials, [payload.productId], payload.productName.slice(0, 150)), getWupexBalance(credentials)]);
   const product = products.find(p => p.id === payload.productId);
   if (!product) throw new WupexError("Wupex product is unavailable. Review this order.");
   const recipient = await wupexRecipient(credentials, payload, product);
   if (balance.currency !== "USD") throw new WupexError("Wupex account currency changed. Review this order.");
   if (balance.amount < product.price || product.available === null || product.available < 1) {
    await store.hold("WAITING", "Waiting for confirmed Wupex stock and sufficient supplier balance."); return "waiting";
   }
   await store.mark(unit.ordinal, sealWupex({ sku: product.sku, quantity: 1, reference: unit.request_key, recipient }, binding(job.item_id, unit.ordinal) + ":request"));
   marked = true;
   const submitted = await submitWupexUnit(credentials, product.sku, unit.request_key, recipient);
   providerId = submitted.orderName;
   await store.record(unit.ordinal, providerId, "unknown", null, sealWupex(submitted, binding(job.item_id, unit.ordinal)));
  } catch (error) {
   const recoverable = marked && payload.cardType === "voucher";
   await store.hold(recoverable ? "UNCERTAIN" : "REVIEW", marked
    ? (recoverable ? "Purchase response is unconfirmed. Looking up the original voucher reference; no new purchase will be sent." : "Top-up outcome is unconfirmed. Check the original Wupex purchase; do not submit again.")
    : error instanceof WupexError ? error.message : "Wupex preflight failed. Review before purchasing.");
   return recoverable ? "waiting" : "review";
  }
 }
 if (!providerId && payload.cardType !== "voucher") {
  await store.hold("REVIEW", "No top-up order ID was saved. Reconcile in Wupex; do not submit again."); return "review";
 }
 try {
  // Reads only after the durable submission marker, including lost POST responses.
  const order = await getWupexOrder(credentials, providerId ? { orderName: providerId } : { referenceId: unit.request_key });
  if (!validateWupexDelivery(order, payload, unit.request_key, providerId)) {
   await store.record(unit.ordinal, order.orderName, "in_process", null, sealWupex(order, binding(job.item_id, unit.ordinal)));
   await store.hold("WAITING", "Wupex is processing the original order. Waiting for confirmed delivery."); return "waiting";
  }
  await store.record(unit.ordinal, order.orderName, "success", order.amount, sealWupex(order, binding(job.item_id, unit.ordinal)));
 } catch (error) {
  const transient = error instanceof WupexError && /could not be reached|request failed|limiting requests/.test(error.message);
  const elapsed = unit.submitted_at ? Date.now() - Date.parse(unit.submitted_at) : 0;
  await store.hold(transient && elapsed < 86400000 ? "UNCERTAIN" : "REVIEW", error instanceof WupexError ? error.message : "Supplier confirmation could not be saved. Check the original order.");
  return transient ? "waiting" : "review";
 }
 if (units.every(u => u.ordinal === unit.ordinal || u.provider_status === "success")) return processWupexPurchase(credentials, job, store);
 await store.hold("WAITING", "Unit delivered. Remaining units are queued."); return "waiting";
}
export async function processWupexDelivery(db: DB, credentials: WupexCredentials, job: WupexJob) {
 const args = { p_item_id: job.item_id, p_token: job.lease_token };
 return processWupexPurchase(credentials, job, {
  async units() {
   const result = await db.from("wupex_units").select("ordinal,request_key,submitted_at,provider_id,provider_status,result_ciphertext").eq("item_id", job.item_id).order("ordinal");
   if (result.error) throw new WupexError("Wupex unit records are unavailable.");
   return result.data ?? [];
  },
  async mark(ordinal, request) { await rpc(db, "mark_wupex_unit_submitted", { ...args, p_ordinal: ordinal, p_request: request }); },
  async record(ordinal, id, status, amount, result) { await rpc(db, "record_wupex_unit", { ...args, p_ordinal: ordinal, p_provider_id: id, p_status: status, p_amount: amount, p_result: result }); },
  async hold(state, issue) { await rpc(db, "update_definiteplay_job", { ...args, p_state: state, p_issue: issue }); },
  async complete(codes) { await rpc(db, "complete_wupex_job", { ...args, p_codes: codes }); },
 });
}
export function createWupexStockReader(credentials: WupexCredentials) {
 let balance: ReturnType<typeof getWupexBalance> | undefined;
 const products = new Map<string, Promise<WupexProduct[]>>();
 return {
  syncedAt: new Date().toISOString(),
  balance: () => balance ??= getWupexBalance(credentials),
  products(id: number, name: string) {
   const query = name.slice(0, 150), key = id + ":" + query;
   if (!products.has(key)) products.set(key, findWupexProducts(credentials, [id], query));
   return products.get(key)!;
  },
 };
}
export async function syncWupexProduct(db: DB, credentials: WupexCredentials, productId: string, reader = createWupexStockReader(credentials)) {
 const connection = wupexConnectionId(credentials);
 const [imp, links] = await Promise.all([
  db.from("wupex_imports").select("connection_id,customer_fields").eq("product_id", productId).single(),
  db.from("wupex_product_links").select("option_id,supplier_product_id,supplier_snapshot").eq("product_id", productId),
 ]);
 if (imp.error || links.error || imp.data.connection_id !== connection) throw new WupexError("Wupex product links are unavailable.");
 const rows: Record<string, unknown>[] = [];
 try {
  const balance = await reader.balance();
  if (balance.currency !== "USD") throw new WupexError("Wupex account currency changed.");
  for (let offset = 0; offset < (links.data?.length ?? 0); offset += 4) {
   const chunk = links.data!.slice(offset, offset + 4);
   rows.push(...await Promise.all(chunk.map(async link => {
    const snapshot = link.supplier_snapshot as WupexProduct;
    const current = (await reader.products(Number(link.supplier_product_id), snapshot.name)).find(p => p.id === Number(link.supplier_product_id));
    if (!current || current.price <= 0 || current.sku !== snapshot.sku || current.cardType !== snapshot.cardType || current.subType !== snapshot.subType) return { optionId: link.option_id, quantity: 0 };
    const fields = await getWupexFields(credentials, current);
    const saved = imp.data.customer_fields as { key: string; fieldType: string }[];
    if (!Array.isArray(saved) || saved.length !== fields.length || fields.some(f => !saved.some(s => s.key === f.key && s.fieldType === f.fieldType))) return { optionId: link.option_id, quantity: 0 };
    const quantity = Math.max(0, Math.min(1000, current.available ?? 0, Math.floor(balance.amount / current.price)));
    return { optionId: link.option_id, quantity, supplierId: String(current.id), supplierCurrency: "USD", supplierCost: String(current.price) };
   })));
  }
  await rpc(db, "sync_wupex_catalogue", { p_product_id: productId, p_connection: connection, p_rows: rows, p_synced_at: reader.syncedAt });
 } catch (error) {
  await rpc(db, "sync_wupex_catalogue", { p_product_id: productId, p_connection: connection, p_rows: [], p_synced_at: reader.syncedAt });
  throw error;
 }
}
export async function runWupexDeliveryTick() {
 const summary = { configured: false, job: "idle", stockUpdated: 0, stockFailed: 0 };
 if (!wupexDeliveryEnabled()) return summary;
 const credentials = await readWupexCredentials();
 if (!credentials) return summary;
 // Test accounts may browse/import drafts but cannot fulfil production orders.
 if (credentials.baseUrl === WUPEX_SANDBOX_URL) return summary;
 assertWupexLive(credentials);
 const db = createAdminClient(), connection = wupexConnectionId(credentials);
 const balance = await getWupexBalance(credentials);
 if (balance.currency !== "USD") throw new WupexError("Wupex account currency must be USD.");
 const heartbeat = await db.from("wupex_worker_state").upsert({ id: true, connection_id: connection, seen_at: new Date().toISOString() });
 if (heartbeat.error) throw new WupexError("Install the Wupex delivery database update.");
 summary.configured = true;
 const started = Date.now();
 // Queue leases and durable per-unit intents permit bounded parallel cron ticks.
 for (let n = 0; n < 5 && Date.now() - started < 45000; n++) {
  const job = await rpc(db, "claim_supplier_job", { p_provider: "WUPEX" }) as WupexJob | null;
  if (!job) break;
  try { summary.job = await processWupexDelivery(db, credentials, job); }
  catch {
   await rpc(db, "update_definiteplay_job", { p_item_id: job.item_id, p_token: job.lease_token, p_state: "UNCERTAIN", p_issue: "Wupex status check interrupted. Only the original request will be checked." });
  }
 }
 const due = await db.from("wupex_imports").select("product_id").eq("connection_id", connection).lt("pricing_synced_at", new Date(Date.now() - 300000).toISOString()).order("pricing_synced_at").limit(5);
 if (due.error) throw new WupexError("Wupex sync records are unavailable.");
 const reader = createWupexStockReader(credentials);
 for (const product of due.data ?? []) {
  if (Date.now() - started > 120000) break;
  try { await syncWupexProduct(db, credentials, product.product_id, reader); summary.stockUpdated++; }
  catch { summary.stockFailed++; }
 }
 return summary;
}
