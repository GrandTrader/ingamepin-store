import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key() {
  // A dedicated key may be supplied. The fallback is the existing private server
  // credential, never the public Supabase key. HKDF separates this purpose.
  const secret = process.env.GAME_ACCOUNT_DETAILS_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 32) throw Error("Protected account details are unavailable.");
  return Buffer.from(hkdfSync("sha256", secret, "ingamepin-account-details-v1", "aes-256-gcm", 32));
}

export function encryptAccountDetail(value: string, binding: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptAccountDetail(value: string, binding: string) {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra) throw Error("Invalid protected detail.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(binding));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function accountDetailBinding(id: string, userId: string, productId: string, fieldId: string) {
  return ["account-detail-v1", id, userId, productId, fieldId].join(":");
}
