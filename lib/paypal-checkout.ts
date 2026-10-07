import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayPalConfiguration, paypalRequest, type PayPalOrder } from "@/lib/paypal";

export function paypalLiveConfiguration() {
  const config = getPayPalConfiguration();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (config.environment !== "live" || !webhookId || !/^[A-Z0-9]{10,32}$/.test(webhookId)) {
    throw Error("PayPal Live setup is incomplete.");
  }
  return { ...config, webhookId };
}

export async function paypalCheckoutAvailable() {
  try {
    paypalLiveConfiguration();
    if (process.env.PAYPAL_CHECKOUT_ENABLED !== "true") return false;
    const admin = createAdminClient();
    const [settings, ready] = await Promise.all([
      admin.from("payment_gateway_settings").select("gateway_commissions").eq("id", true).maybeSingle(),
      admin.rpc("paypal_checkout_ready"),
    ]);
    return !settings.error && !ready.error && ready.data === true && settings.data?.gateway_commissions?.PAYPAL?.enabled === true;
  } catch { return false; }
}

export type PayPalCheckout = {
  order_id: string;
  payment_id: string;
  request_id: string;
  amount: number | string;
  currency: string;
  return_origin: string;
  paypal_order_id: string | null;
  merchant_id: string | null;
  capture_id: string | null;
  created_at: string;
};

const providerId = /^[A-Z0-9]{10,32}$/;
export function paypalMoney(value: unknown) {
  const text = String(value);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0) {
    throw Error("Invalid PayPal amount.");
  }
  return Number(text).toFixed(2);
}

export function verifyPayPalOrder(order: PayPalOrder, checkout: PayPalCheckout, creating = false) {
  const unit = order.purchase_units?.[0];
  if (!providerId.test(order.id ?? "") || (!creating && order.id !== checkout.paypal_order_id) ||
      order.intent !== "CAPTURE" || order.purchase_units?.length !== 1 ||
      unit?.reference_id !== checkout.order_id || unit.custom_id !== checkout.order_id ||
      checkout.currency !== "USD" || unit.amount?.currency_code !== "USD" ||
      paypalMoney(unit.amount?.value) !== paypalMoney(checkout.amount) ||
      !providerId.test(unit.payee?.merchant_id ?? "") ||
      (!creating && unit.payee?.merchant_id !== checkout.merchant_id)) {
    throw Error("PayPal order verification failed.");
  }
  return unit;
}

export function paypalApprovalUrl(order: PayPalOrder) {
  const link = order.links?.find(item => item.rel === "payer-action" || item.rel === "approve");
  const url = new URL(link?.href ?? "");
  if (link?.method !== "GET" || url.origin !== "https://www.paypal.com" || url.username || url.password ||
      url.searchParams.get("token") !== order.id) throw Error("PayPal checkout link is invalid.");
  return url.href;
}

export async function authorizePayPalOrder(orderId: unknown, accessToken: unknown) {
  if (typeof orderId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(orderId) ||
      typeof accessToken !== "string" || accessToken.length < 40 || accessToken.length > 128) {
    throw Error("Order access was denied.");
  }
  const result = await createAdminClient().from("orders").select("id,access_token_hash").eq("id", orderId).maybeSingle();
  const stored = result.data?.access_token_hash;
  if (result.error || typeof stored !== "string" || !/^[0-9a-f]{64}$/i.test(stored)) throw Error("Order access was denied.");
  const actual = createHash("sha256").update(accessToken).digest();
  if (!timingSafeEqual(actual, Buffer.from(stored, "hex"))) throw Error("Order access was denied.");
  return orderId;
}

export async function createPayPalCheckout(orderId: string, origin: string) {
  if (!(await paypalCheckoutAvailable())) throw Error("PayPal is currently unavailable.");
  // Real checkout requires HTTPS. Localhost remains an isolated Sandbox test.
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw Error("Secure checkout is required.");
  const admin = createAdminClient();
  const reserved = await admin.rpc("begin_paypal_checkout", { p_order_id: orderId, p_return_origin: origin });
  if (reserved.error || !reserved.data) throw Error("Unable to prepare this PayPal payment.");
  const checkout = reserved.data as PayPalCheckout;
  let order: PayPalOrder;
  if (checkout.paypal_order_id) {
    order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${checkout.paypal_order_id}`, "GET");
    verifyPayPalOrder(order, checkout);
  } else {
    // Stop before PayPal's idempotency retention expires if a creation response was lost.
    if (Date.now() - Date.parse(checkout.created_at) > 3 * 60 * 60 * 1000) throw Error("This checkout has expired. Contact support before retrying.");
    order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: checkout.order_id, custom_id: checkout.order_id,
        description: "InGamePin digital products", amount: { currency_code: "USD", value: paypalMoney(checkout.amount) } }],
      payment_source: { paypal: { experience_context: {
        brand_name: "InGamePin", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW",
        return_url: `${checkout.return_origin}/checkout/paypal?order=${checkout.order_id}`,
        cancel_url: `${checkout.return_origin}/checkout/paypal?order=${checkout.order_id}&cancelled=1`,
      } } },
    }, checkout.request_id);
    const unit = verifyPayPalOrder(order, checkout, true);
    const attached = await admin.rpc("attach_paypal_checkout", {
      p_order_id: checkout.order_id, p_paypal_order_id: order.id, p_merchant_id: unit.payee!.merchant_id,
    });
    if (attached.error) throw Error("Unable to save this PayPal payment. Please retry the same order.");
  }
  if (!["CREATED", "PAYER_ACTION_REQUIRED", "APPROVED"].includes(order.status)) throw Error("Check this order's payment status before paying again.");
  return { checkoutUrl: paypalApprovalUrl(order) };
}

export async function confirmPayPalCheckout(orderId: string, expectedPayPalId?: string, allowCapture = true) {
  paypalLiveConfiguration(); // Sandbox can never complete a real store order.
  const admin = createAdminClient();
  const saved = await admin.from("paypal_checkouts").select("*").eq("order_id", orderId).maybeSingle();
  const checkout = saved.data as PayPalCheckout | null;
  if (saved.error || !checkout?.paypal_order_id || (expectedPayPalId && expectedPayPalId !== checkout.paypal_order_id)) {
    throw Error("PayPal payment was not found.");
  }
  let order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${checkout.paypal_order_id}`, "GET");
  verifyPayPalOrder(order, checkout);
  if (order.status === "APPROVED" && allowCapture) {
    // Lock and recheck the local state before capturing. The stable request ID
    // protects simultaneous browser returns, notifications and lost responses.
    const permitted = await admin.rpc("check_paypal_capture", { p_order_id: orderId });
    if (permitted.error || permitted.data !== true) throw Error("This order cannot accept a payment.");
    order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${checkout.paypal_order_id}/capture`, "POST", {}, `capture-${checkout.request_id}`);
  }
  const unit = verifyPayPalOrder(order, checkout);
  if (order.status !== "COMPLETED") return { status: "PENDING" as const, orderId };
  const capture = unit.payments?.captures?.[0];
  if (unit.payments?.captures?.length !== 1 || capture?.status !== "COMPLETED" || capture.final_capture !== true ||
      !providerId.test(capture.id ?? "") || capture.amount?.currency_code !== "USD" ||
      paypalMoney(capture.amount?.value) !== paypalMoney(checkout.amount)) throw Error("PayPal payment is not confirmed.");
  const completed = await admin.rpc("complete_paypal_checkout", {
    p_order_id: orderId, p_paypal_order_id: order.id, p_capture_id: capture.id,
    p_merchant_id: unit.payee!.merchant_id, p_amount: paypalMoney(capture.amount!.value), p_currency: "USD",
  });
  if (completed.error) throw Error("Payment confirmation is being retried. Do not pay again.");
  return { status: "COMPLETED" as const, orderId, alreadyCompleted: completed.data?.alreadyCompleted === true };
}
