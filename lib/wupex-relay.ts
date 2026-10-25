import "server-only";
import { createHmac, hkdfSync, randomBytes } from "node:crypto";

// Dedicated HTTPS route on the existing InGamePin VPS. Never accept a browser-supplied relay URL.
export const WUPEX_RELAY_URL = "https://pally-relay.ingamepin.com/wupex/request";
export type WupexRelayRequest = {
  baseUrl: string; endpoint: string; method: "GET" | "POST"; apiKey: string;
  body?: Record<string, unknown> | Record<string, unknown>[];
};
export function deriveWupexRelayKey(): Buffer {
  const master = process.env.WUPEX_ENCRYPTION_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!master || master.length < 32) throw new Error("Wupex relay signing is not configured.");
  // The VPS receives this isolated subkey, never the Supabase key.
  return Buffer.from(hkdfSync("sha256", master, "ingamepin-wupex-relay-v1", "request-authentication", 32));
}
export async function requestWupexThroughRelay(request: WupexRelayRequest): Promise<Response> {
  const body = JSON.stringify(request);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(24).toString("hex");
  const signature = createHmac("sha256", deriveWupexRelayKey())
    .update(timestamp + "\n" + nonce + "\n").update(body).digest("hex");
  // No retries or direct fallback: a timed-out purchase may already have reached Wupex.
  return fetch(WUPEX_RELAY_URL, {
    method: "POST", body,
    headers: { "Content-Type": "application/json", Accept: "application/json",
      "x-wupex-timestamp": timestamp, "x-wupex-nonce": nonce, "x-wupex-signature": signature },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
  });
}
