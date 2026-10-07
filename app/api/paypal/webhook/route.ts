import { privateJson } from "@/lib/request-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayPalCheckout } from "@/lib/paypal-checkout";
import { finishPayPalOrder } from "@/lib/paypal-notifications";
import { readPayPalBody, verifyPayPalWebhook } from "@/lib/paypal-webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let raw: string;
  try { raw = await readPayPalBody(request, 128 * 1024); JSON.parse(raw); }
  catch { return privateJson({ error: "Invalid notification." }, 400); }
  try {
    const event = await verifyPayPalWebhook(raw, request.headers);
    if (!event) return privateJson({ error: "Invalid notification signature." }, 401);
    if (!["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(event.event_type!)) return privateJson({ received: true });
    const paypalId = event.event_type === "CHECKOUT.ORDER.APPROVED" ? event.resource?.id : event.resource?.supplementary_data?.related_ids?.order_id;
    if (!paypalId || !/^[A-Z0-9]{10,32}$/.test(paypalId)) return privateJson({ error: "Missing payment reference." }, 400);
    const found = await createAdminClient().from("paypal_checkouts").select("order_id").eq("paypal_order_id", paypalId).maybeSingle();
    if (found.error) throw Error("Payment lookup failed.");
    // This Live app may receive events for other integrations. Never attach them by customer-supplied metadata.
    if (!found.data) return privateJson({ received: true });
    const result = await confirmPayPalCheckout(found.data.order_id, paypalId, event.event_type === "CHECKOUT.ORDER.APPROVED");
    if (result.status === "COMPLETED") await finishPayPalOrder(found.data.order_id);
    else return privateJson({ error: "Payment confirmation pending." }, 503);
    return privateJson({ received: true });
  } catch {
    // Non-2xx asks PayPal to retry lost responses and delivery/notification failures.
    return privateJson({ error: "Notification will be retried." }, 503);
  }
}
