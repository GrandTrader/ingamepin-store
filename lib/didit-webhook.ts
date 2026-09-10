import { createHmac, timingSafeEqual } from "node:crypto";
export function authenticateDiditWebhook(raw: Buffer, signature: string | null, timestamp: string | null, secret: string, now = Date.now()): Record<string, unknown> | null {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature) || !timestamp || !/^\d{10}$/.test(timestamp)) return null;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return null;
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
  try {
    const event = JSON.parse(raw.toString("utf8"));
    if (!event || typeof event !== "object" || Array.isArray(event) || Number(event.timestamp) !== Number(timestamp)) return null;
    return event;
  } catch { return null; }
}
export function diditEventMetadata(event: Record<string, unknown>) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof event.event_id !== "string" || !uuid.test(event.event_id) || typeof event.session_id !== "string" || !uuid.test(event.session_id) || typeof event.status !== "string" || event.status.length > 80 || !event.status || !["sandbox", "test", "live"].includes(String(event.environment))) return null;
  return {event_id:event.event_id, session_id:event.session_id, environment:String(event.environment), event_type:String(event.webhook_type), provider_status:event.status, dispatched_at:new Date(Number(event.timestamp)*1000).toISOString()};
}
