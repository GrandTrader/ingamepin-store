import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { securityHash } from "@/lib/request-security";

const MAX_AGE = 180 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// A signed, first-party browser cookie. Never use it to authenticate or prove a device/person.
export async function customerBrowserId(): Promise<string | null> {
  try {
    const store = await cookies();
    const secure = process.env.NODE_ENV === "production";
    const name = secure ? "__Host-igp-browser" : "igp-browser";
    const value = store.get(name)?.value || "";
    const parts = value.length <= 160 ? value.split(".") : [];
    const [id, issued, signature] = parts;
    const now = Math.floor(Date.now() / 1000);
    if (parts.length === 3 && UUID.test(id) && /^\d{10}$/.test(issued) && /^[0-9a-f]{64}$/.test(signature)) {
      const age = now - Number(issued);
      const expected = securityHash(`customer-browser:v1:${id}:${issued}`);
      if (age >= 0 && age < MAX_AGE && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return id;
    }
    const nextId = randomUUID(), at = String(now);
    const signed = `${nextId}.${at}.${securityHash(`customer-browser:v1:${nextId}:${at}`)}`;
    store.set(name, signed, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: MAX_AGE });
    return nextId;
  } catch {
    // Cookie/signing failures must not prevent sign-in or IP history recording.
    return null;
  }
}
