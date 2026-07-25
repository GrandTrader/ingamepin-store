import { createHash, randomBytes } from "node:crypto";

export const SUPPORT_COOKIE = "igp_support_token";

export function createSupportToken() {
  return randomBytes(32).toString("hex");
}

export function hashSupportToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function cleanSupportText(value: unknown, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

