import "server-only";
import type { GiftPortStatus } from "./giftport-types";

export async function giftPortRequest<T>(endpoint: "status" | "configure" | "refresh", body?: unknown): Promise<T> {
  // Share the existing private gateway credential by default, never supplier keys.
  const existing = process.env.DEFINITEPLAY_RELAY_URL;
  const base = process.env.GIFTPORT_RELAY_URL || (existing ? new URL("/giftport", existing).href : "");
  const secret = process.env.GIFTPORT_RELAY_SECRET || process.env.DEFINITEPLAY_RELAY_SECRET;
  if (!base || !secret) throw new Error("GiftPort server connection has not been configured.");
  const url = new URL(base.replace(/\/$/, "") + "/" + endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("GiftPort server configuration is invalid.");
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error("Unable to reach the GiftPort server. Try again shortly."); }
  if (!response.ok) {
    if (response.status === 429) throw new Error("Please wait 30 seconds before trying again.");
    if (response.status === 401) throw new Error("GiftPort server authentication needs attention.");
    throw new Error("GiftPort server request failed. Check the connection and try again.");
  }
  try { return await response.json() as T; }
  catch { throw new Error("GiftPort server returned an invalid response."); }
}
export function getGiftPortStatus() { return giftPortRequest<GiftPortStatus>("status"); }
