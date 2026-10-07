import "server-only";
import { createHash } from "node:crypto";
import { paypalRequest } from "@/lib/paypal";
import { paypalLiveConfiguration } from "@/lib/paypal-checkout";

export type PayPalWebhook = {
  id?: string;
  event_type?: string;
  resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
};

export async function readPayPalBody(request: Request, limit = 8192) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw Error("Request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function verifyPayPalWebhook(raw: string, headers: Headers): Promise<PayPalWebhook | null> {
  const { webhookId } = paypalLiveConfiguration();
  const fields = {
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_time: headers.get("paypal-transmission-time"),
    cert_url: headers.get("paypal-cert-url"),
    auth_algo: headers.get("paypal-auth-algo"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    webhook_id: webhookId,
  };
  if (Object.values(fields).some(value => !value || value.length > 4096) || fields.auth_algo !== "SHA256withRSA") return null;
  const cert = new URL(fields.cert_url!);
  if (!["https://api.paypal.com", "https://api-m.paypal.com"].includes(cert.origin) || cert.username || cert.password ||
      !/^\/v1\/notifications\/certs\/[A-Za-z0-9-]+$/.test(cert.pathname) || cert.search || cert.hash) return null;
  const event = JSON.parse(raw) as PayPalWebhook;
  if (!event || typeof event.id !== "string" || typeof event.event_type !== "string") return null;
  // Keep the webhook's raw JSON intact for PayPal signature verification.
  const payload = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${raw}}`;
  const result = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature", "POST", payload,
    `verify-${createHash("sha256").update(fields.transmission_id!).digest("hex").slice(0, 32)}`,
  );
  return result.verification_status === "SUCCESS" ? event : null;
}
