import "server-only";
import { createHash } from "node:crypto";
import type { FKBalance, FKCategory, FKCurrency, FKProduct, FKResult } from "./fkwallet-types";

export class FKError extends Error {
  constructor(message: string, readonly httpStatus?: number, readonly retryAfterMs?: number) { super(message); }
}
export type FKCredentials = { publicKey: string; privateKey: string };
type Row = Record<string, unknown>;
export function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FKError("FKWallet returned an unexpected response.");
  return value as Row;
}
function text(value: unknown, max = 10000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Providers may serialize decimal balances (especially crypto) with padding
  // or an exponent. Keep user-entered purchase amounts separately validated.
  if (typeof value === "string") {
    const decimal = value.trim();
    if (decimal.length <= 100 && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(decimal) && Number.isFinite(Number(decimal))) return Number(decimal);
  }
  throw new FKError("FKWallet returned an invalid amount.");
}
export function positiveId(value: unknown): number {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw new FKError("Choose a valid FKWallet item.");
  return id;
}
export function positiveAmount(value: unknown): number {
  const amount = typeof value === "string" && /^\d+(\.\d{1,8})?$/.test(value) ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) throw new FKError("Enter a valid positive amount.");
  return amount;
}
export function validateCredentials(credentials: FKCredentials) {
  if (!/^[a-zA-Z0-9_-]{8,256}$/.test(credentials.publicKey) || !/^[\x21-\x7e]{8,512}$/.test(credentials.privateKey)) {
    throw new FKError("Enter the public and private API keys without spaces or extra text.");
  }
}
export function signature(body: string, privateKey: string) {
  return createHash("sha256").update(body + privateKey, "utf8").digest("hex");
}
export function connectionId(credentials: FKCredentials) {
  return createHash("sha256").update(credentials.publicKey).digest("hex");
}
export function unwrapResponse(value: unknown): unknown {
  let envelope = object(value);
  // The published schema wraps the normal status/data envelope in another data object.
  if (envelope.status === undefined && envelope.data && !Array.isArray(envelope.data)) envelope = object(envelope.data);
  if (envelope.status !== "ok") throw new FKError("FKWallet did not accept the request. Check the details, balance and API permissions in FKWallet.");
  return envelope.data ?? null;
}

async function readJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new FKError("FKWallet returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) throw new FKError("FKWallet returned too much data. Contact support before retrying a transaction.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { await reader.cancel().catch(() => {}); }
}

export async function fkRequest(credentials: FKCredentials, endpoint: string, body?: Record<string, unknown>): Promise<unknown> {
  validateCredentials(credentials);
  const history = /^history\?date_from=\d{4}-\d{2}-\d{2}&date_to=\d{4}-\d{2}-\d{2}&page=[1-9]\d{0,3}&limit=100$/.test(endpoint);
  if (!(history && body === undefined) && !/^(balance|currencies|op\/categories|op\/categories\/\d+\/products|op\/(validate|create)|op\/status\/\d+)$/.test(endpoint)) {
    throw new FKError("Unsupported FKWallet operation.");
  }
  const serialized = body === undefined ? "" : JSON.stringify(body);
  try {
    const response = await fetch(`https://api.fkwallet.io/v1/${encodeURIComponent(credentials.publicKey)}/${endpoint}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${signature(serialized, credentials.privateKey)}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : serialized, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter === null ? undefined : /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
      await response.body?.cancel();
      throw new FKError(response.status === 401 || response.status === 403
        ? "FKWallet denied access. Check the API keys, permissions and allowed server IPs."
        : `FKWallet request failed (HTTP ${response.status}).`, response.status,
        Number.isFinite(retryAfterMs) ? retryAfterMs : undefined);
    }
    return unwrapResponse(await readJson(response));
  } catch (error) {
    // Never expose URLs, request bodies, provider errors or keys to logs/browser errors.
    if (error instanceof FKError) throw error;
    throw new FKError("FKWallet could not be reached or returned an invalid response.");
  }
}
function rows(value: unknown): Row[] {
  let list: unknown[];
  if (Array.isArray(value)) list = value;
  else if (value && typeof value === "object") {
    const entries = Object.entries(value);
    // PHP collections can become JSON objects when their numeric keys are not
    // contiguous. Preserve the records instead of treating the map as a row.
    list = entries.every(([key, row]) => /^\d+$/.test(key) && row !== null && typeof row === "object" && !Array.isArray(row))
      ? entries.map(([, row]) => row) : [value];
  } else list = value == null ? [] : [value];
  if (list.length > 20000) throw new FKError("FKWallet catalogue is too large.");
  return list.map(object);
}
export function parseBalances(value: unknown): FKBalance[] {
  let balanceRows = rows(value);
  if (value && typeof value === "object" && !Array.isArray(value) && !("currency_code" in value)) {
    const entries = Object.entries(value);
    // Also accept currencies as keys, without substituting a default currency
    // or silently turning missing/malformed amounts into zero.
    if (entries.length && entries.every(([code]) => /^[A-Z][A-Z0-9_-]{1,15}$/.test(code))) {
      balanceRows = entries.map(([code, amount]) => {
        if (amount !== null && typeof amount === "object" && !Array.isArray(amount)) {
          const row = object(amount);
          if (row.currency_code !== undefined && row.currency_code !== code) throw new FKError("FKWallet returned conflicting balance currencies.");
          return { ...row, currency_code: code };
        }
        return { currency_code: code, value: amount };
      });
    }
  }
  return balanceRows.map(row => {
    const amount = numeric(row.value);
    if (!text(row.currency_code, 16) || !Number.isFinite(amount)) throw new FKError("FKWallet balance is unavailable.");
    return { currency: text(row.currency_code, 16), value: amount };
  });
}
export function parseCurrencies(value: unknown): FKCurrency[] {
  return rows(value).map(row => ({ id: positiveId(row.id), code: text(row.code, 30) }));
}
export function parseCategories(value: unknown): FKCategory[] {
  return rows(value).map(row => ({ id: positiveId(row.id), name: text(row.name_en || row.name_ru, 200), parentId: row.parent_id ? positiveId(row.parent_id) : null }));
}
export function parseProducts(value: unknown): FKProduct[] {
  return rows(value).map(row => {
    const price = numeric(row.price);
    if (!Number.isFinite(price) || price < 0 || !text(row.currency, 16)) throw new FKError("FKWallet product price is unavailable.");
    return {
      id: positiveId(row.id), name: text(row.name_en || row.name_ru, 300),
      description: text(row.description_en || row.description_ru), help: text(row.help_description_en || row.help_description_ru),
      nameRu: text(row.name_ru, 300), descriptionRu: text(row.description_ru), helpRu: text(row.help_description_ru),
      productType: text(row.product_type, 40), priceType: text(row.price_type, 40), imageUrl: text(row.logo, 2000),
      price, currency: text(row.currency, 16),
      params: rows(row.params).map(p => ({ key: text(p.key, 100), value: text(p.value, 1000) })),
      fields: rows(row.fields).map(f => ({ key: text(f.key, 100),
        label: text(f.label, 300), type: text(f.type, 40), required: f.required === true,
        placeholder: text(f.placeholder || (f.info && typeof f.info === "object" && !Array.isArray(f.info) ? (f.info as Row).placeholder : ""), 300),
        hasChoices: f.values != null && (Array.isArray(f.values) ? f.values.length > 0 : true),
        values: Array.isArray(f.values) ? f.values.filter(v => typeof v === "string").slice(0, 1000) as string[] : [],
        info: Array.isArray(f.info) ? f.info.filter(v => typeof v === "string").slice(0, 30) as string[] : [],
      })),
    };
  });
}
export function parseResult(value: unknown): FKResult {
  const row = object(value);
  const id = String(positiveId(row.id));
  if (typeof row.status !== "number" || !Number.isInteger(row.status)) throw new FKError("FKWallet returned an unknown transaction status.");
  const result: FKResult = { id, status: row.status };
  if (typeof row.coupon_code === "string") result.couponCode = text(row.coupon_code, 20000);
  if (Array.isArray(row.fields)) result.fields = rows(row.fields).map(f => ({ key: text(f.key, 200), value: text(f.value, 20000) }));
  if (row.esim_data) {
    const esim = object(row.esim_data);
    result.esim = { qrCode: text(esim.qr_code_text), universalLink: text(esim.universal_link), androidLink: text(esim.android_universal_link) };
  }
  return result;
}

export type FKHistoryOrder = { id: string; status: "in_process" | "success" | "error" | "cancel" | "refund" | "unknown"; amount: number; currency: string };
// History's info.id identifies the digital order. The outer id is a wallet
// ledger entry, and a successful API envelope is NOT a delivered order.
export function parseDigitalHistory(value: unknown): FKHistoryOrder[] {
  return rows(value).filter(row => row.operation === "OnlineProductOrder").map(row => {
    const info = object(row.info);
    const status = ["in_process", "success", "error", "cancel", "refund"].includes(String(info.status)) ? info.status as FKHistoryOrder["status"] : "unknown";
    const amount = Math.abs(numeric(row.amount));
    if (!/^[A-Z][A-Z0-9_-]{1,15}$/.test(String(row.currency_code)) || amount <= 0) throw new FKError("FKWallet purchase history could not be verified.");
    return { id: String(positiveId(info.id)), status, amount, currency: row.currency_code as string };
  });
}

export async function findFKOrderHistory(credentials: FKCredentials, providerId: string, createdAt: string): Promise<FKHistoryOrder | null> {
  const id = String(positiveId(providerId)), created = Date.parse(createdAt);
  if (!Number.isFinite(created) || created > Date.now() + 60000) throw new FKError("Invalid purchase date.");
  const day = 86400000;
  const from = new Date(created - day).toISOString().slice(0, 10);
  const to = new Date(Date.now() + day).toISOString().slice(0, 10);
  // Bound work; an unmatched record stays unconfirmed, never successful.
  for (let page = 1; page <= 5; page++) {
    const response = await fkRequest(credentials, `history?date_from=${from}&date_to=${to}&page=${page}&limit=100`);
    const records = rows(response);
    const matches = parseDigitalHistory(records.filter(row => row.operation === "OnlineProductOrder" && row.info && typeof row.info === "object" && String((row.info as Row).id) === id));
    if (matches.length > 1) throw new FKError("FKWallet returned conflicting purchase history. Review this order.");
    if (matches.length === 1) return matches[0];
    if (records.length < 100) break;
  }
  return null;
}
