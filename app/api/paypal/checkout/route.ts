import { assertCustomerPurchaseAccess, customerPurchaseContext, CustomerPurchaseAccessError } from "@/lib/customer-purchase-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizePayPalOrder, confirmPayPalCheckout, createPayPalCheckout } from "@/lib/paypal-checkout";
import { paypalRequestOrigin } from "@/lib/paypal-request-origin";
import { readPayPalBody } from "@/lib/paypal-webhook";
import { finishPayPalOrder } from "@/lib/paypal-notifications";
import { consumeRate, privateJson } from "@/lib/request-security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const origin = paypalRequestOrigin(request);
  if (!origin) return privateJson({ error: "Invalid request origin." }, 403);
  let body: { orderId?: unknown; accessToken?: unknown; action?: unknown; paypalOrderId?: unknown };
  try { body = JSON.parse(await readPayPalBody(request)); if (!body || typeof body !== "object") throw Error(); }
  catch { return privateJson({ error: "Invalid payment request." }, 400); }
  if (!["create", "confirm"].includes(String(body.action))) return privateJson({ error: "Invalid payment action." }, 400);
  let orderId: string;
  try { orderId = await authorizePayPalOrder(body.orderId, body.accessToken); }
  catch { return privateJson({ error: "Order access was denied." }, 403); }
  try {
    if (!(await consumeRate("paypal-checkout", orderId, 20, 300))) return privateJson({ error: "Please wait before trying again." }, 429);
    if (body.action === "create") {
      const admin = createAdminClient();
      const order = await admin.from("orders").select("customer_id,customer_email").eq("id", orderId).single();
      if (order.error || !order.data) throw Error("Unable to check purchase access.");
      await assertCustomerPurchaseAccess(admin, await customerPurchaseContext(request), { userId: order.data.customer_id, email: order.data.customer_email });
      return privateJson(await createPayPalCheckout(orderId, origin));
    }
    if (typeof body.paypalOrderId !== "string" || !/^[A-Z0-9]{10,32}$/.test(body.paypalOrderId)) return privateJson({ error: "Invalid payment reference." }, 400);
    const result = await confirmPayPalCheckout(orderId, body.paypalOrderId);
    if (result.status === "COMPLETED") {
      // A notification failure must never invite a second customer payment.
      try { await finishPayPalOrder(orderId); } catch { console.error("PayPal paid-order follow-up requires retry", orderId); }
    }
    return privateJson({ status: result.status, orderId });
  } catch (error) {
    if (error instanceof CustomerPurchaseAccessError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: body.action === "create" ? "Unable to open PayPal. Please retry this order or contact support." :
      "We could not confirm the payment yet. Please check again before paying a second time." }, 503);
  }
}
