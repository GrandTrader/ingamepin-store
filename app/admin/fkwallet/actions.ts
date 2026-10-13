"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireFKAdmin } from "@/lib/fkwallet-admin";
import { connectionId, FKError, fkRequest, findFKOrderHistory, object, parseBalances, parseCategories, parseCurrencies, parseProducts, parseResult, positiveAmount, positiveId, validateCredentials } from "@/lib/fkwallet-api";
import { environmentConfigured, readCredentials, requireCredentials, seal, unseal } from "@/lib/fkwallet-storage";
import type { FKAction, FKDashboard, FKProduct, FKPurchaseInput, FKResult, FKReview, FKSummary, FKTransaction } from "@/lib/fkwallet-types";

const publicColumns = "id,reference,state,summary,provider_id,provider_status,created_at,expires_at,note";
function safeError(error: unknown) {
  return error instanceof FKError ? error.message : "FKWallet could not complete this action. Check the connection and database setup.";
}
function validId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new FKError("Choose a valid purchase.");
}

export async function loadFKDashboard(): Promise<FKDashboard> {
  const { db } = await requireFKAdmin();
  const dashboard: FKDashboard = { connected: false, databaseReady: false, configuredByEnvironment: environmentConfigured(), balances: [], categories: [], currencies: [], transactions: [], errors: [] };
  const history = await db.from("fkwallet_transactions").select(publicColumns).order("created_at", { ascending: false }).limit(20);
  if (history.error) dashboard.errors.push("The FKWallet database update must be installed before purchases can be enabled.");
  else { dashboard.databaseReady = true; dashboard.transactions = history.data as FKTransaction[]; }
  try {
    const credentials = await readCredentials();
    if (!credentials) return dashboard;
    const outcomes = await Promise.allSettled([
      fkRequest(credentials, "balance").then(value => {
        // Authentication has succeeded even if a new balance format needs work.
        dashboard.connected = true;
        return parseBalances(value);
      }),
      fkRequest(credentials, "op/categories").then(parseCategories),
      fkRequest(credentials, "currencies").then(parseCurrencies),
    ]);
    const [balances, categories, currencies] = outcomes;
    if (balances.status === "fulfilled") { dashboard.balances = balances.value; dashboard.connected = true; }
    if (categories.status === "fulfilled") dashboard.categories = categories.value;
    if (currencies.status === "fulfilled") dashboard.currencies = currencies.value;
    outcomes.forEach((outcome, index) => { if (outcome.status === "rejected") dashboard.errors.push(`${["Balance", "Categories", "Currencies"][index]}: ${safeError(outcome.reason)}`); });
  } catch (error) { dashboard.errors.push(safeError(error)); }
  return dashboard;
}

export async function connectFKWallet(form: FormData): Promise<FKAction<boolean>> {
  const { db, userId } = await requireFKAdmin();
  try {
    if (environmentConfigured()) throw new FKError("This connection uses server environment keys. Update those keys on the server.");
    const credentials = { publicKey: String(form.get("publicKey") ?? "").trim(), privateKey: String(form.get("privateKey") ?? "").trim() };
    validateCredentials(credentials);
    // Verify with a read-only call; connecting never purchases a product.
    // Verify authentication using the provider's success envelope. Formatting
    // a balance must not prevent valid keys from being securely saved.
    await fkRequest(credentials, "balance");
    const saved = await db.from("fkwallet_settings").upsert({ id: true, credentials_ciphertext: seal(credentials, "fkwallet:credentials"), updated_by: userId, updated_at: new Date().toISOString() });
    if (saved.error) throw new FKError("The connection was verified but could not be saved. Install the FKWallet database update first.");
    revalidatePath("/admin/fkwallet");
    return { data: true };
  } catch (error) { return { error: safeError(error) }; }
}

export async function loadFKProducts(categoryId: number): Promise<FKAction<FKProduct[]>> {
  await requireFKAdmin();
  try {
    const id = positiveId(categoryId);
    return { data: parseProducts(await fkRequest(await requireCredentials(), `op/categories/${id}/products`)) };
  } catch (error) { return { error: safeError(error) }; }
}

export async function prepareFKPurchase(input: FKPurchaseInput): Promise<FKAction<FKReview>> {
  const { db, userId } = await requireFKAdmin();
  try {
    object(input);
    const categoryId = positiveId(input.categoryId), productId = positiveId(input.productId);
    const credentials = await requireCredentials();
    const [products, currencies] = await Promise.all([
      fkRequest(credentials, `op/categories/${categoryId}/products`).then(parseProducts),
      fkRequest(credentials, "currencies").then(parseCurrencies),
    ]);
    const product = products.find(p => p.id === productId);
    if (!product) throw new FKError("This product is no longer available. Refresh the category.");
    if (input.expectedPrice !== product.price || input.expectedCurrency !== product.currency) throw new FKError("The supplier price changed. Refresh the product and review the new price.");
    const currency = currencies.find(c => c.code.toUpperCase() === product.currency.toUpperCase());
    if (!currency) throw new FKError("The supplier currency cannot be matched. This product needs a connection check before ordering.");
    if (!Array.isArray(input.fields) || input.fields.length > 50 || input.fields.length !== product.fields.length) throw new FKError("Complete the product details shown by FKWallet.");
    const fields = product.fields.map(field => {
      const matches = input.fields.filter(f => f && f.key === field.key);
      if (matches.length !== 1 || typeof matches[0].value !== "string" || !matches[0].value.trim() || matches[0].value.length > 2000) throw new FKError("Complete every required product detail.");
      const value = matches[0].value.trim();
      if (field.values.length && !field.values.includes(value)) throw new FKError("Choose one of the available product options.");
      return { key: field.key, value };
    });
    const amount = input.amount ? positiveAmount(input.amount) : undefined;
    if (!product.price && amount === undefined) throw new FKError("Enter the requested amount for this variable-value product.");
    const id = randomUUID();
    const body = { online_product_id: productId, currency_id: currency.id, fields, ...(amount === undefined ? {} : { amount }), idempotence_key: `igp-${id}` };
    await fkRequest(credentials, "op/validate", { ...body, idempotence_key: `igp-check-${id}` });
    const summary: FKSummary = { title: product.name, currency: product.currency, amount: product.price, listedPrice: product.price, categoryId, productId, ...(amount === undefined ? {} : { requestedAmount: amount }) };
    const saved = await db.from("fkwallet_transactions").insert({
      id, admin_user_id: userId, connection_id: connectionId(credentials), summary,
      request_ciphertext: seal(body, `fkwallet:request:${id}`),
    }).select(publicColumns).single();
    if (saved.error || !saved.data) throw new FKError("The purchase review could not be saved. No purchase was submitted.");
    return { data: { transaction: saved.data as FKTransaction, fields } };
  } catch (error) { return { error: safeError(error) }; }
}

export async function confirmFKPurchase(id: string): Promise<FKAction<FKTransaction>> {
  const { db, userId } = await requireFKAdmin();
  let attempted = false;
  let claimed = false;
  try {
    validId(id);
    const credentials = await requireCredentials();
    const record = await db.from("fkwallet_transactions").select("*").eq("id", id).eq("admin_user_id", userId).single();
    if (record.error || !record.data) throw new FKError("This purchase review was not found.");
    const row = record.data;
    if (row.connection_id !== connectionId(credentials)) throw new FKError("The FKWallet account changed. Create a new purchase review.");
    if (row.state !== "READY") throw new FKError("This request has already been handled. Check its status in Recent purchases; do not create a replacement.");
    if (Date.parse(row.expires_at) <= Date.now()) throw new FKError("This review expired. Validate the details again before purchasing.");
    const summary = row.summary as FKSummary;
    const body = unseal<Record<string, unknown>>(row.request_ciphertext, `fkwallet:request:${id}`);
    const products = parseProducts(await fkRequest(credentials, `op/categories/${positiveId(summary.categoryId)}/products`));
    const product = products.find(p => p.id === summary.productId);
    if (!product || product.price !== summary.listedPrice || product.currency !== summary.currency) throw new FKError("The supplier product or price changed. Refresh it and create a new review.");
    await fkRequest(credentials, "op/validate", { ...body, idempotence_key: `igp-recheck-${id}` });
    // One atomic transition wins even when two tabs confirm simultaneously.
    const claim = await db.from("fkwallet_transactions").update({ state: "SUBMITTING", updated_at: new Date().toISOString() })
      .eq("id", id).eq("admin_user_id", userId).eq("state", "READY").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (claim.error || !claim.data) throw new FKError("This review expired or is already being submitted. Check Recent purchases.");
    claimed = true;
    // Persisted idempotence key is reused as-is; a network failure must never create another request.
    attempted = true;
    const result = parseResult(await fkRequest(credentials, "op/create", body));
    const saved = await db.from("fkwallet_transactions").update({ state: "SUBMITTED", provider_id: result.id, provider_status: result.status,
      result_ciphertext: seal(result, `fkwallet:result:${id}`), updated_at: new Date().toISOString(), note: null,
    }).eq("id", id).eq("state", "SUBMITTING").select(publicColumns).single();
    if (saved.error || !saved.data) throw new FKError(`FKWallet accepted order ${result.id}, but its local record could not be saved. Keep this order number and check FKWallet. Do not submit another purchase.`);
    revalidatePath("/admin/fkwallet");
    return { data: saved.data as FKTransaction };
  } catch (error) {
    if (claimed && attempted) {
      const note = error instanceof FKError && error.message.startsWith("FKWallet accepted order") ? error.message
        : "The purchase outcome is unconfirmed. Check FKWallet using the request reference before placing another order.";
      // Also covers server/provider errors where the upstream transaction may already exist.
      await db.from("fkwallet_transactions").update({ state: "UNKNOWN", note, updated_at: new Date().toISOString() }).eq("id", id).eq("state", "SUBMITTING");
      return { error: note };
    }
    return { error: safeError(error) };
  }
}

export async function refreshFKPurchase(id: string): Promise<FKAction<{ transaction: FKTransaction; result: FKResult }>> {
  const { db } = await requireFKAdmin();
  try {
    validId(id);
    const credentials = await requireCredentials();
    const record = await db.from("fkwallet_transactions").select("*").eq("id", id).single();
    if (record.error || !record.data) throw new FKError("Purchase not found.");
    const row = record.data;
    if (row.connection_id !== connectionId(credentials)) throw new FKError("This purchase belongs to a different FKWallet connection.");
    if (!row.provider_id) throw new FKError("No FKWallet order number was received. Check this request in your FKWallet account. Do not place it again.");
    const result = parseResult(await fkRequest(credentials, `op/status/${positiveId(row.provider_id)}`));
    if (result.id !== row.provider_id) throw new FKError("FKWallet returned a different order. Contact support.");
    const history = await findFKOrderHistory(credentials, result.id, row.created_at);
    result.deliveryStatus = history?.status ?? "unknown";
    const saved = await db.from("fkwallet_transactions").update({ state: "SUBMITTED", provider_status: result.status,
      result_ciphertext: seal(result, `fkwallet:result:${id}`), updated_at: new Date().toISOString(), note: null,
    }).eq("id", id).eq("provider_id", result.id).select(publicColumns).single();
    if (saved.error || !saved.data) throw new FKError("The latest result could not be saved. Check FKWallet before repeating the purchase.");
    return { data: { transaction: saved.data as FKTransaction, result } };
  } catch (error) { return { error: safeError(error) }; }
}

export async function readFKPurchaseResult(id: string): Promise<FKAction<FKResult>> {
  const { db } = await requireFKAdmin();
  try {
    validId(id);
    const record = await db.from("fkwallet_transactions").select("result_ciphertext").eq("id", id).single();
    if (record.error || !record.data?.result_ciphertext) throw new FKError("No result is saved yet. Check the purchase status.");
    return { data: unseal<FKResult>(record.data.result_ciphertext, `fkwallet:result:${id}`) };
  } catch (error) { return { error: safeError(error) }; }
}

export async function cancelFKReview(id: string): Promise<FKAction<boolean>> {
  const { db, userId } = await requireFKAdmin();
  try {
    validId(id);
    const result = await db.from("fkwallet_transactions").update({ state: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", id).eq("admin_user_id", userId).eq("state", "READY").select("id").maybeSingle();
    if (result.error || !result.data) throw new FKError("This review is no longer pending. Check Recent purchases.");
    return { data: true };
  } catch (error) { return { error: safeError(error) }; }
}
