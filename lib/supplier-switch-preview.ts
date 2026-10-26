import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function sign(value: string) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Supplier preview signing is unavailable.");
  return createHmac("sha256", key).update("supplier-switch:v1:" + value).digest("hex");
}
export function supplierPreviewToken(userId: string, productId: string, version: string, draft: unknown, selection: unknown, expires = Date.now() + 5 * 60000) {
  const digest = sign(JSON.stringify([userId, productId, version, draft, selection, expires]));
  return `${expires}.${digest}`;
}
export function verifySupplierPreview(token: string, userId: string, productId: string, version: string, draft: unknown, selection: unknown) {
  if (typeof token !== "string" || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const expires = Number(token.split(".")[0]);
  if (expires < Date.now() || expires > Date.now() + 5 * 60000) return false;
  const expected = supplierPreviewToken(userId, productId, version, draft, selection, expires);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
