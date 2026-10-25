import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWupexCredentials, WupexError } from "./wupex-api";
import type { WupexCredentials } from "./wupex-types";

function key(): Buffer {
  const secret = process.env.WUPEX_ENCRYPTION_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 32) throw new WupexError("Wupex secure storage is not configured.");
  return Buffer.from(hkdfSync("sha256", secret, "ingamepin-wupex-v1", "aes-256-gcm", 32));
}
export function sealWupex(value: unknown, binding: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function unsealWupex<T>(value: string, binding: string): T {
  try {
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw Error();
    const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    cipher.setAAD(Buffer.from(binding));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64url")), cipher.final()]).toString("utf8")) as T;
  } catch { throw new WupexError("Wupex protected settings could not be read. Check the server encryption key."); }
}
export const wupexEnvironmentConfigured = () => !!(process.env.WUPEX_API_URL || process.env.WUPEX_API_KEY || process.env.WUPEX_MERCHANT_CODE);
export async function readWupexCredentials(): Promise<WupexCredentials | null> {
  if (wupexEnvironmentConfigured()) return validateWupexCredentials({
    baseUrl: process.env.WUPEX_API_URL?.trim() ?? "",
    apiKey: process.env.WUPEX_API_KEY?.trim() ?? "",
    merchantCode: process.env.WUPEX_MERCHANT_CODE?.trim() ?? "",
  });
  const { data, error } = await createAdminClient().from("wupex_settings").select("credentials_ciphertext").eq("id", true).maybeSingle();
  if (error) throw new WupexError("Install the Wupex database update before connecting.");
  return data ? unsealWupexCredentials(data.credentials_ciphertext) : null;
}
export async function requireWupexCredentials(): Promise<WupexCredentials> {
  const credentials = await readWupexCredentials();
  if (!credentials) throw new WupexError("Connect your Wupex account first.");
  return credentials;
}

export const sealWupexCredentials = (credentials: WupexCredentials) => sealWupex(validateWupexCredentials(credentials), "wupex:credentials");
export const unsealWupexCredentials = (value: string) => validateWupexCredentials(unsealWupex<WupexCredentials>(value, "wupex:credentials"));
