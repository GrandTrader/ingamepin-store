import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateGatewayCommission, type GatewayCommissionSettings } from "@/lib/payment-gateway-commissions";
import { getPaypalychRestrictions } from "@/lib/paypalych-product-policy-server";
import { paypalCheckoutAvailable } from "@/lib/paypal-checkout";
import { retryPaymentMethods } from "@/lib/checkout-expiry";

export const checkoutMethodChoices = [
  { value: "wallet", method: "WALLET", label: "InGamePin Wallet" },
  { value: "manual_upi", method: "UPI", label: "UPI" },
  { value: "paypal", method: "PAYPAL", label: "PayPal" },
  { value: "binance", method: "BINANCE_PAY", label: "Binance Pay" },
  { value: "pally", method: "PALLY", label: "SBP - Faster Payments System" },
  { value: "upi", method: "UPI", label: "Manual USDT" },
  { value: "usdt", method: "USDT_DIRECT", label: "Direct USDT" },
  { value: "freekassa", method: "FREEKASSA", label: "FreeKassa" },
];
export type RetryChoice = { value: string; method: string; label: string; total: number; fee: number };
type Order = { id: string; total: number | string; payment_fee?: number | string | null; currency: string };
type Payment = { method: string; status: string; checkout_variant?: string | null; checkout_revision: number;
  verified_at?: string | null; submitted_at?: string | null; transaction_id?: string | null; screenshot_url?: string | null };
function configured(...names: string[]) { return names.every(name => Boolean(process.env[name]?.trim())); }
function available(method: string) {
  switch (method) {
    case "BINANCE_PAY": return configured("BINANCE_PAY_API_KEY", "BINANCE_PAY_SECRET_KEY");
    case "USDT_DIRECT": return configured("USDT_GATEWAY_URL", "USDT_GATEWAY_API_SECRET", "USDT_GATEWAY_CALLBACK_SECRET");
    case "PALLY": return configured("PALLY_SHOP_ID") && (configured("PALLY_API_TOKEN") || configured("PALLY_RELAY_URL", "PALLY_RELAY_SECRET"));
    case "FREEKASSA": return configured("FREEKASSA_MERCHANT_ID", "FREEKASSA_SECRET_WORD_1", "FREEKASSA_SECRET_WORD_2");
    default: return true;
  }
}
export async function retryPaymentOptions(admin: ReturnType<typeof createAdminClient>, order: Order, payment: Payment, walletAllowed: boolean) {
  if (payment.status !== "PENDING" || payment.verified_at || payment.submitted_at || payment.transaction_id || payment.screenshot_url)
    throw Error("This payment needs review. Check the order status before paying again.");
  if (order.currency !== "USD") throw Error("Contact support to change this order's payment method.");
  const [items, settings, attempts] = await Promise.all([
    admin.from("order_items").select("product_id").eq("order_id", order.id),
    admin.from("payment_gateway_settings").select("gateway_commissions").eq("id", true).single(),
    admin.from("checkout_payment_attempts").select("method,gateway_order_id,received_at").eq("order_id", order.id),
  ]);
  if (items.error || settings.error || attempts.error) throw Error("Unable to load payment options.");
  if (attempts.data?.some(attempt => attempt.received_at)) throw Error("A payment has been received. Contact support before paying again.");
  const ids = [...new Set((items.data ?? []).map(item => String(item.product_id)))];
  if (!ids.length) throw Error("This order has no payable items.");
  const products = await admin.from("products").select("id,allowed_payment_methods,allowed_usdt_networks").in("id", ids);
  if (products.error || products.data?.length !== ids.length) throw Error("Unable to check payment restrictions.");
  const rules = await getPaypalychRestrictions(admin, ids);
  const commissions = settings.data.gateway_commissions as GatewayCommissionSettings | null;
  const current = payment.checkout_variant || retryPaymentMethods[payment.method];
  const paypal = await paypalCheckoutAvailable();
  const used = new Set((attempts.data ?? []).filter(attempt => attempt.gateway_order_id).map(attempt => attempt.method));
  const choices: RetryChoice[] = [];
  for (const choice of checkoutMethodChoices) {
    const config = commissions?.[choice.method as keyof GatewayCommissionSettings];
    if (choice.method === "WALLET" && !walletAllowed) continue;
    if (choice.method === "PAYPAL" && !paypal) continue;
    if (choice.method === "PALLY" && [...rules.values()].some(Boolean)) continue;
    if (config?.enabled === false || (choice.method === "UPI" && config?.enabled !== true)) continue;
    if (!available(choice.method) || used.has(choice.method)) continue;
    if (!products.data.every(product => product.allowed_payment_methods == null ? choice.method !== "PAYPAL" : product.allowed_payment_methods.includes(choice.method))) continue;
    if (choice.method === "USDT_DIRECT" && !["TRC20", "BEP20", "SOLANA"].some(network => products.data.every(product => (product.allowed_usdt_networks ?? ["TRC20", "BEP20", "SOLANA"]).includes(network)))) continue;
    const same = choice.method === payment.method && (choice.method !== "UPI" || choice.value === current);
    const quote = calculateGatewayCommission(commissions, choice.value, Number(order.total) - Number(order.payment_fee ?? 0));
    choices.push({ ...choice, total: same ? Number(order.total) : quote.total, fee: same ? Number(order.payment_fee ?? 0) : quote.fee });
  }
  // Existing legacy NOWPayments invoices can be resumed, but new checkout no longer offers them.
  if (payment.method === "NOWPAYMENTS") choices.push({ value: "nowpayments", method: "NOWPAYMENTS", label: "NOWPayments", total: Number(order.total), fee: Number(order.payment_fee ?? 0) });
  return { choices, selected: choices.some(choice => choice.value === current) ? current : choices[0]?.value ?? "", revision: payment.checkout_revision };
}
