import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getPayPalConfiguration, paypalRequest, type PayPalOrder } from "@/lib/paypal";

// Sandbox transactions deliberately have no dependency on orders, wallets or fulfillment.
export const PAYPAL_TEST_AMOUNT = "1.00";
type TestSession = { version: 1; environment: "sandbox"; orderId: string; userId: string; reference: string; merchantId: string; expires: number };

export function paypalSandboxConfiguration() {
  const config = getPayPalConfiguration();
  if (config.environment !== "sandbox") throw new Error("This test page only supports PayPal Sandbox.");
  return config;
}

function sign(value: string) {
  return createHmac("sha256", paypalSandboxConfiguration().secret).update(`ingamepin-paypal-sandbox-v1:${value}`).digest();
}

function sessionToken(session: TestSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

function readSession(token: string, userId: string): TestSession {
  if (token.length > 2048) throw new Error("Invalid PayPal test session.");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) throw new Error("Invalid PayPal test session.");
  const supplied = Buffer.from(signature, "base64url");
  const expected = sign(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid PayPal test session.");
  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TestSession;
  if (session.version !== 1 || session.environment !== "sandbox" || session.userId !== userId || !Number.isFinite(session.expires) || session.expires <= Date.now()
    || !/^[A-Z0-9]{10,32}$/.test(session.orderId) || typeof session.reference !== "string" || !session.reference.startsWith("IGP-TEST-") || !session.merchantId) {
    throw new Error("Your PayPal test session has expired or is invalid. Start a new test.");
  }
  return session;
}

function validateOrder(order: PayPalOrder, session: TestSession) {
  const units = order.purchase_units;
  const unit = units?.[0];
  if (order.id !== session.orderId || order.intent !== "CAPTURE" || units?.length !== 1 || unit?.custom_id !== session.reference
    || unit.amount?.currency_code !== "USD" || unit.amount.value !== PAYPAL_TEST_AMOUNT || unit.payee?.merchant_id !== session.merchantId) {
    throw new Error("The PayPal test payment details could not be verified.");
  }
  return unit;
}

export async function createPayPalSandboxOrder(userId: string, returnOrigin: string) {
  paypalSandboxConfiguration();
  const origin = new URL(returnOrigin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.hostname.endsWith(".localhost");
  if (origin.origin !== returnOrigin || (origin.protocol !== "https:" && !(origin.protocol === "http:" && local))) {
    throw new Error("Invalid PayPal return origin.");
  }
  const returnUrl = new URL("/admin/payment-settings/paypal?paypal=approved", origin);
  const cancelUrl = new URL("/admin/payment-settings/paypal?paypal=cancelled", origin);
  const reference = `IGP-TEST-${randomUUID()}`;
  const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", "POST", {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: reference, custom_id: reference, description: "InGamePin Sandbox test — no product delivery", amount: { currency_code: "USD", value: PAYPAL_TEST_AMOUNT } }],
    payment_source: { paypal: { experience_context: { brand_name: "InGamePin Sandbox", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", return_url: returnUrl.href, cancel_url: cancelUrl.href } } },
  }, reference);
  const merchantId = order.purchase_units?.[0]?.payee?.merchant_id;
  if (!/^[A-Z0-9]{10,32}$/.test(order.id) || !merchantId || !["CREATED", "PAYER_ACTION_REQUIRED"].includes(order.status)) {
    throw new Error("PayPal did not return a valid test order.");
  }
  const session: TestSession = { version: 1, environment: "sandbox", orderId: order.id, userId, reference, merchantId, expires: Date.now() + 30 * 60_000 };
  validateOrder(order, session);
  const link = order.links?.find(item => item.rel === "payer-action") ?? order.links?.find(item => item.rel === "approve");
  const approvalUrl = new URL(link?.href ?? "about:blank");
  if (link?.method !== "GET" || !["https://www.sandbox.paypal.com", "https://sandbox.paypal.com"].includes(approvalUrl.origin)
    || approvalUrl.username || approvalUrl.password || approvalUrl.searchParams.get("token") !== order.id) {
    throw new Error("PayPal did not return a valid Sandbox checkout link.");
  }
  return { orderId: order.id, sessionToken: sessionToken(session), approvalUrl: approvalUrl.href };
}

export async function capturePayPalSandboxOrder(token: string, userId: string) {
  paypalSandboxConfiguration();
  const session = readSession(token, userId);
  let order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${session.orderId}`, "GET");
  validateOrder(order, session);
  if (order.status === "APPROVED") {
    order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${session.orderId}/capture`, "POST", {}, `IGP-TEST-CAPTURE-${session.orderId}`);
  }
  const unit = validateOrder(order, session);
  const captures = unit.payments?.captures;
  const capture = captures?.[0];
  if (order.status !== "COMPLETED" || captures?.length !== 1 || capture?.status !== "COMPLETED" || !capture.final_capture
    || !capture.id || capture.amount?.currency_code !== "USD" || capture.amount.value !== PAYPAL_TEST_AMOUNT) {
    throw new Error("PayPal has not confirmed a completed test payment. Please check the Sandbox account and try verification again.");
  }
  return { status: "COMPLETED" as const, environment: "sandbox" as const, orderId: order.id, captureId: capture.id, amount: PAYPAL_TEST_AMOUNT, currency: "USD" };
}
