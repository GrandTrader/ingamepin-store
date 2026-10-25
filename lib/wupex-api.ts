import "server-only";
import { createHash } from "node:crypto";
import { requestWupexThroughRelay } from "./wupex-relay";
import type { WupexBalance, WupexCatalog, WupexCredentials, WupexProduct } from "./wupex-types";

export const WUPEX_SANDBOX_URL = "https://sandbox-service.wupex.com";
export class WupexError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
type Row = Record<string, unknown>;
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WupexError("Wupex returned an unexpected response.");
  return value as Row;
}
function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}
function amount(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^-?\d+(?:\.\d{1,8})?$/.test(value)) ||
      !Number.isFinite(Number(value))) throw new WupexError("Wupex returned an invalid amount.");
  return Number(value);
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const n = amount(value);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum) throw new WupexError("Wupex returned an invalid quantity or identifier.");
  return n;
}
export function normalizeWupexBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new WupexError("Enter the HTTPS service URL supplied by Wupex."); }
  // Credentials are never sent to an arbitrary host, portal page or redirect.
  if (url.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)+wupex\.com$/.test(url.hostname) ||
      ["portal.wupex.com", "sandbox-portal.wupex.com", "www.wupex.com"].includes(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new WupexError("Use a Wupex HTTPS service URL, without a path, login details or query.");
  }
  return url.origin;
}
export function validateWupexCredentials(credentials: WupexCredentials): WupexCredentials {
  if (!credentials || typeof credentials.baseUrl !== "string" || typeof credentials.apiKey !== "string" || typeof credentials.merchantCode !== "string") {
    throw new WupexError("Enter the Wupex service URL, API key and merchant code.");
  }
  const baseUrl = normalizeWupexBaseUrl(credentials.baseUrl.trim());
  const apiKey = credentials.apiKey.trim(), merchantCode = credentials.merchantCode.trim();
  if (!/^[\x21-\x7e]{8,2048}$/.test(apiKey) || !/^[\x21-\x7e]{1,200}$/.test(merchantCode) ||
      [apiKey, merchantCode].some(value => /^your[ _-]|^<|{{/i.test(value))) {
    throw new WupexError("Enter your real Wupex API key and merchant code. Example values cannot connect an account.");
  }
  return { baseUrl, apiKey, merchantCode };
}
export function wupexConnectionId(credentials: WupexCredentials): string {
  const c = validateWupexCredentials(credentials);
  return createHash("sha256").update(c.baseUrl + "\n" + c.merchantCode).digest("hex");
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new WupexError("Wupex returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) throw new WupexError("Wupex returned too much data. Use a smaller page.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { await reader.cancel().catch(() => {}); }
}
async function request(credentials: WupexCredentials, endpoint: string, body?: Row | Row[], method?: "GET" | "POST"): Promise<Row> {
  const c = validateWupexCredentials(credentials);
  const allowed = [
    "/api/customer/balance", "/api/preorder/status", "/api/product/merchant/invited/list",
    "/api/order/topup-listservers", "/api/order/topup/product/attribute", "/api/order/topup", "/api/order/pull-codes", "/api/order/detail",
  ];
  if (!allowed.includes(endpoint.split("?")[0])) throw new WupexError("Unsupported Wupex operation.");
  try {
    const response = await requestWupexThroughRelay({
      baseUrl: c.baseUrl, endpoint, apiKey: c.apiKey,
      method: method ?? (body === undefined ? "GET" : "POST"),
      ...(body === undefined ? {} : { body }),
    });
    if (!response.ok) {
      const failure = await readJson(response).catch(() => null);
      const detail = failure && typeof failure === "object" && !Array.isArray(failure) ? failure as Row : {};
      if (detail.relayError === "UPSTREAM_CLOUDFLARE_BLOCK") {
        const ray = typeof detail.rayId === "string" && /^[a-fA-F0-9]{8,32}(?:-[A-Z0-9]{2,8})?$/.test(detail.rayId) ? detail.rayId : "";
        throw new WupexError("Wupex's Cloudflare firewall blocked the VPS connection. Ask Wupex to review server IP 187.127.167.138." + (ray ? " Reference: " + ray + "." : ""), response.status);
      }
      if (detail.relayError === "RELAY_AUTH_FAILED") throw new WupexError("Wupex VPS connection authentication failed. The server configuration needs updating.", response.status);
      if (typeof detail.relayError === "string" && ["UPSTREAM_UNREACHABLE", "UPSTREAM_REDIRECT_REFUSED", "UPSTREAM_INVALID_RESPONSE", "UPSTREAM_RESPONSE_TOO_LARGE"].includes(detail.relayError)) {
        throw new WupexError("Wupex could not return a verified response through the VPS. Any submitted purchase must be checked before retrying.", response.status);
      }
      throw new WupexError(response.status === 401 || response.status === 403
        ? "Wupex denied API access from the VPS. Check the live API key and Wupex account permissions."
        : response.status === 429 ? "Wupex is limiting requests. Wait briefly and refresh."
        : "Wupex request failed (HTTP " + response.status + ").", response.status);
    }
    const envelope = row(await readJson(response));
    if (envelope.status !== true) throw new WupexError("Wupex did not accept the request. Check your account permissions.");
    return envelope;
  } catch (error) {
    if (error instanceof WupexError) throw error;
    // Never expose keys, request URLs or raw provider errors to the browser/logs.
    throw new WupexError("Wupex could not be reached or returned an invalid response.");
  }
}
export function parseWupexBalance(value: unknown): WupexBalance {
  const data = row(value);
  const currency = text(data.currency, 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new WupexError("Wupex balance currency is unavailable.");
  return { amount: amount(data.balance), currency };
}
export async function getWupexBalance(credentials: WupexCredentials): Promise<WupexBalance> {
  return parseWupexBalance((await request(credentials, "/api/customer/balance")).data);
}
export async function getWupexPreorderStatus(credentials: WupexCredentials): Promise<boolean> {
  const data = row((await request(credentials, "/api/preorder/status")).data);
  if (typeof data.enabled !== "boolean") throw new WupexError("Wupex pre-order status is unavailable.");
  return data.enabled;
}
export function parseWupexCatalog(value: unknown, requestedPage: number): WupexCatalog {
  const envelope = row(value), paging = row(envelope.pageInfo);
  if (envelope.status !== true || !Array.isArray(envelope.data) || envelope.data.length > 100) throw new WupexError("Wupex returned an invalid catalogue.");
  const page = integer(paging.currentPage, 1), pageSize = integer(paging.pageSize, 1, 100);
  const totalPages = integer(paging.totalPage), totalCount = integer(paging.totalCount);
  if (page !== requestedPage || envelope.data.length > pageSize || (totalCount > 0 && totalPages < 1)) throw new WupexError("Wupex catalogue paging could not be verified.");
  const seen = new Set<number>();
  const products = envelope.data.map(value => {
    const data = row(value), id = integer(data.productId, 1);
    const sku = text(data.productCode, 250), name = text(data.productName, 500), price = amount(data.price);
    const cardType = data.cardType;
    if (seen.has(id) || !sku || !name || price < 0 || !["voucher", "topup"].includes(String(cardType))) throw new WupexError("Wupex returned an invalid product.");
    seen.add(id);
    const available = data.available == null ? null : integer(data.available);
    const faceValue = data.faceValue == null ? null : amount(data.faceValue);
    const subType = data.subType == null ? null : integer(data.subType, 1, 5);
    if (faceValue !== null && faceValue < 0) throw new WupexError("Wupex returned an invalid face value.");
    return { id, sku, name, price, available, faceValue, subType, cardType: cardType as WupexProduct["cardType"], region: text(data.regionName, 100) };
  });
  return { products, page, pageSize, totalPages, totalCount };
}
export async function getWupexCatalog(credentials: WupexCredentials, page = 1, query = "", kind = "", pageSize = 20): Promise<WupexCatalog> {
  if (![20, 100].includes(pageSize) || !Number.isSafeInteger(page) || page < 1 || page > 100000 || typeof query !== "string" || query.length > 150 || !["", "voucher", "topup"].includes(kind)) throw new WupexError("Choose a valid catalogue page and search.");
  const search = [
    ...(query.trim() ? [{ column: "productName", operator: "Contains", value: query.trim() }] : []),
    ...(kind ? [{ column: "cardType", operator: "Equals", value: kind }] : []),
  ];
  const envelope = await request(credentials, "/api/product/merchant/invited/list", { page, pageSize, ...(search.length ? { search } : {}) });
  return parseWupexCatalog(envelope, page);
}

export async function findWupexProducts(credentials: WupexCredentials, ids: number[], query = ""): Promise<WupexProduct[]> {
  if (!ids.length || ids.length > 50 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new WupexError("Select between 1 and 50 products.");
  const found = new Map<number, WupexProduct>();
  // Bound one request: narrowing by the saved product name avoids a catalogue-wide scan.
  for (let page = 1; page <= 20; page++) {
    const result = await getWupexCatalog(credentials, page, query, "", 100);
    for (const product of result.products) if (ids.includes(product.id)) {
      if (found.has(product.id)) throw new WupexError("Wupex returned a duplicate product. Refresh the catalogue.");
      found.set(product.id, product);
    }
    if (found.size === new Set(ids).size || page >= result.totalPages) return [...found.values()];
  }
  throw new WupexError("Narrow the catalogue search before importing these products.");
}
export type WupexField = { key: string; label: string; placeholder: string; fieldType: "TEXT"; isRequired: true };
export async function getWupexFields(credentials: WupexCredentials, product: WupexProduct): Promise<WupexField[]> {
  if (product.cardType === "voucher") return [];
  const field = (key: string, label: string, placeholder = ""): WupexField => ({ key, label, placeholder, fieldType: "TEXT", isRequired: true });
  if (product.subType === 5) {
    const data = (await request(credentials, "/api/order/topup/product/attribute?productId=" + integer(product.id, 1))).data;
    if (!Array.isArray(data) || !data.length || data.length > 10) throw new WupexError("Wupex recipient attributes are unavailable.");
    const seen = new Set<number>();
    return data.flatMap(value => {
      const attr = row(value), id = integer(attr.attribute_id, 1), label = text(attr.name, 80);
      if (!label || typeof attr.required !== "boolean" || seen.has(id)) throw new WupexError("Invalid Wupex recipient attributes.");
      seen.add(id);
      return attr.required ? [field("attribute_" + id, label)] : [];
    });
  }
  if (!product.subType || ![1, 2, 3, 4].includes(product.subType)) throw new WupexError("Wupex top-up type is unavailable.");
  const fields = [field("userId", "Player / user ID")];
  if ([2, 4].includes(product.subType)) {
    const servers = await getWupexServers(credentials, product.sku);
    fields.push(field("serverId", "Server ID", servers.map(s => s.id + " (" + s.name + ")").join(", ").slice(0, 150)));
  }
  if ([3, 4].includes(product.subType)) fields.push(field("zoneId", "Zone ID"));
  return fields;
}
export async function getWupexServers(credentials: WupexCredentials, sku: string) {
  const data = (await request(credentials, "/api/order/topup-listservers?sku=" + encodeURIComponent(sku), undefined, "POST")).data;
  if (!Array.isArray(data) || !data.length || data.length > 5000) throw new WupexError("Wupex server list is unavailable.");
  return data.map(value => {
    const server = row(value), id = text(String(server.serverId ?? ""), 100), name = text(server.name, 100);
    if (!id || !name) throw new WupexError("Wupex server list is invalid.");
    return { id, name };
  });
}
export async function submitWupexUnit(credentials: WupexCredentials, sku: string, reference: string, recipient: Row | null): Promise<{ orderName: string }> {
  if (!sku || sku.length > 250 || !/^[a-zA-Z0-9_-]{1,100}$/.test(reference)) throw new WupexError("Invalid supplier order reference.");
  const item = { merchant: credentials.merchantCode, sku, quantity: 1 };
  const result = recipient === null
    ? await request(credentials, "/api/order/pull-codes?referenceId=" + encodeURIComponent(reference) + "&allowTakeAll=false", [item])
    : await request(credentials, "/api/order/topup", { ...item, ...recipient });
  const data = row(result.data);
  const orderName = text(data.orderName, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderName)) throw new WupexError("Wupex accepted the request without a usable order number. Review the original purchase.");
  return { orderName };
}
export type WupexOrder = { orderName: string; reference: string | null; status: string; amount: number; total: number; delivered: number; remaining: number; codes: { sku: string; code: string }[]; skus: string[] };
export function parseWupexOrder(value: unknown): WupexOrder {
  const data = row(value), orderName = text(data.orderName, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderName)) throw new WupexError("Wupex order identity is unavailable.");
  const status = text(data.statusType ?? data.status, 30).toUpperCase();
  if (!["COMPLETED", "PROCESSING", "PENDING", "FAILED"].includes(status)) throw new WupexError("Wupex order status is not confirmed.");
  const total = integer(data.totalQuantity), delivered = integer(data.deliveredQuantity), remaining = integer(data.remainingQuantity);
  const charge = amount(data.orderAmount);
  if (total < 1 || delivered + remaining !== total || charge < 0) throw new WupexError("Wupex order quantities or charge do not match.");
  const codes: WupexOrder["codes"] = [], skus: string[] = [];
  if (!Array.isArray(data.orderData) || data.orderData.length > 1000) throw new WupexError("Wupex order items are missing.");
  for (const value of data.orderData) {
    const item = row(value), sku = text(item.productCode, 250);
    if (!sku) throw new WupexError("Wupex order SKU is missing.");
    skus.push(sku);
    if (item.serials == null) continue;
    if (!Array.isArray(item.serials) || item.serials.length > 1000) throw new WupexError("Invalid Wupex codes.");
    for (const value of item.serials) {
      const serial = row(value);
      if (serial.productSku != null && serial.productSku !== sku) throw new WupexError("Wupex delivered a different SKU.");
      if (typeof serial.serialCode !== "string" || !serial.serialCode.trim() || serial.serialCode.length > 10000) throw new WupexError("Wupex delivered an empty or invalid code.");
      codes.push({ sku, code: serial.serialCode.trim() });
    }
  }
  return { orderName, reference: data.referenceId == null ? null : text(data.referenceId, 100), status, amount: charge, total, delivered, remaining, codes, skus };
}
export async function getWupexOrder(credentials: WupexCredentials, lookup: { orderName: string } | { referenceId: string }): Promise<WupexOrder> {
  const [key, value] = Object.entries(lookup)[0];
  if (!["orderName", "referenceId"].includes(key) || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new WupexError("Invalid Wupex lookup.");
  return parseWupexOrder((await request(credentials, "/api/order/detail?" + key + "=" + encodeURIComponent(value))).data);
}
