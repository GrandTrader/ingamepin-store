import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { FKError, validateCredentials, type FKCredentials } from "./fkwallet-api";

function encryptionKey() {
  const secret = process.env.FKWALLET_ENCRYPTION_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 32) throw new FKError("FKWallet secure storage is not configured.");
  return Buffer.from(hkdfSync("sha256", secret, "ingamepin-fkwallet-v1", "aes-256-gcm", 32));
}
export function seal(value: unknown, binding: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function unseal<T>(value: string, binding: string): T {
  try {
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw Error();
    const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    cipher.setAAD(Buffer.from(binding));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64url")), cipher.final()]).toString("utf8")) as T;
  } catch { throw new FKError("FKWallet protected data could not be read. Check the server encryption key."); }
}
export const environmentConfigured = () => !!(process.env.FKWALLET_PUBLIC_KEY || process.env.FKWALLET_PRIVATE_KEY);
export async function readCredentials(): Promise<FKCredentials | null> {
  if (environmentConfigured()) {
    const credentials = { publicKey: process.env.FKWALLET_PUBLIC_KEY?.trim() ?? "", privateKey: process.env.FKWALLET_PRIVATE_KEY?.trim() ?? "" };
    validateCredentials(credentials);
    return credentials;
  }
  const { data, error } = await createAdminClient().from("fkwallet_settings").select("credentials_ciphertext").eq("id", true).maybeSingle();
  if (error) throw new FKError("Install the FKWallet database update to enable this connection.");
  if (!data) return null;
  const credentials = unseal<FKCredentials>(data.credentials_ciphertext, "fkwallet:credentials");
  validateCredentials(credentials);
  return credentials;
}
export async function requireCredentials() {
  const credentials = await readCredentials();
  if (!credentials) throw new FKError("Connect your FKWallet account first.");
  return credentials;
}
