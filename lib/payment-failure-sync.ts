import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPallyBillStatus } from "@/lib/pally";
import { getFreeKassaOrders } from "@/lib/freekassa";
import { callBinancePay } from "@/lib/binance-pay";
import { paypalRequest, type PayPalOrder } from "@/lib/paypal";
import { paypalLiveConfiguration, verifyPayPalOrder, type PayPalCheckout } from "@/lib/paypal-checkout";

export const failureSyncMethods = ["PALLY", "FREEKASSA", "BINANCE_PAY", "NOWPAYMENTS", "PAYPAL"];
export type PendingGatewayPayment = {
  id: string; order_id: string; method: string; gateway_order_id: string;
  gateway_payment_id: string | null; amount: number | string; currency: string;
};
type Status = { state: string; unpaidFailure: boolean };
const status = (state: string, unpaidFailure = false): Status => ({ state, unpaidFailure });

export async function verifiedGatewayFailure(payment: PendingGatewayPayment, providerPaymentId?: string): Promise<Status> {
  const reference = payment.gateway_order_id;
  if (!reference) return status("NO_REFERENCE");
  switch (payment.method) {
    case "PALLY": {
      const bill = await getPallyBillStatus(reference);
      if (bill.id !== reference || bill.order_id !== payment.order_id || bill.currency_in !== "RUB")
        throw Error("Gateway reference mismatch");
      return status(String(bill.status ?? "UNKNOWN"), bill.status === "FAIL");
    }
    case "FREEKASSA": {
      const result = await getFreeKassaOrders(reference);
      // A merchant reference can have multiple attempts. Every returned attempt
      // must be terminal and unpaid; never infer failure from an empty result.
      if (reference !== payment.order_id || result.pages > 1 || !result.orders.length)
        return status("UNKNOWN");
      if (result.orders.some(o => o.merchant_order_id !== reference || o.currency !== "RUB" ||
        !Number.isFinite(Number(o.amount)) || Math.abs(Number(o.amount) - Number(payment.gateway_payment_id)) > 0.005))
        throw Error("Gateway reference mismatch");
      const failed = result.orders.every(o => o.status === 8 || o.status === 9);
      return status(failed ? String(result.orders[0].status) : "OPEN_OR_PAID", failed);
    }
    case "BINANCE_PAY": {
      const order = await callBinancePay<{ prepayId: string; merchantTradeNo: string; status: string; transactionId?: string }>(
        "/binancepay/openapi/v2/order/query", { prepayId: reference }, 10_000);
      if (order.prepayId !== reference || order.merchantTradeNo !== payment.order_id.replaceAll("-", ""))
        throw Error("Gateway reference mismatch");
      return status(order.status, ["CANCELED", "EXPIRED"].includes(order.status) && !order.transactionId);
    }
    case "NOWPAYMENTS": {
      const id = providerPaymentId ?? payment.gateway_payment_id;
      if (!id || !/^\d+$/.test(id)) return status("AWAITING_PAYMENT_REFERENCE");
      const key = process.env.NOWPAYMENTS_API_KEY?.trim();
      if (!key) throw Error("Gateway is not configured");
      const response = await fetch("https://api.nowpayments.io/v1/payment/" + id, {
        headers: { "x-api-key": key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw Error("Gateway check unavailable");
      const record = await response.json();
      if (String(record.payment_id) !== id || String(record.invoice_id) !== reference || record.order_id !== payment.order_id)
        throw Error("Gateway reference mismatch");
      // Failed crypto payments may still contain funds. Require explicit zero.
      const zeroPaid = record.actually_paid != null && record.actually_paid !== "" &&
        Number.isFinite(Number(record.actually_paid)) && Number(record.actually_paid) === 0;
      if (!zeroPaid || !["failed", "expired"].includes(record.payment_status))
        return status(String(record.payment_status ?? "UNKNOWN"));
      // Hosted invoices can have several payment attempts. A failed attempt is
      // not proof that another attempt has not received funds.
      const jwt = process.env.NOWPAYMENTS_JWT_TOKEN?.trim();
      if (!jwt) return status("INVOICE_REVIEW_REQUIRED");
      const attemptsResponse = await fetch("https://api.nowpayments.io/v1/payment/?invoiceid=" + encodeURIComponent(reference) + "&limit=500&page=0", {
        headers: { "x-api-key": key, Authorization: "Bearer " + jwt }, cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (!attemptsResponse.ok) throw Error("Gateway check unavailable");
      const attempts = await attemptsResponse.json();
      if (attempts.pagesCount !== 1 || !Array.isArray(attempts.data) || !attempts.data.length ||
        !attempts.data.some((row: { payment_id?: unknown }) => String(row.payment_id) === id))
        return status("INVOICE_REVIEW_REQUIRED");
      const unpaid = attempts.data.every((row: { invoice_id?: unknown; order_id?: unknown; actually_paid?: unknown; payment_status?: unknown }) =>
        String(row.invoice_id) === reference && row.order_id === payment.order_id &&
        (typeof row.actually_paid === "number" || typeof row.actually_paid === "string") &&
        String(row.actually_paid).trim() !== "" && Number(row.actually_paid) === 0 &&
        ["failed", "expired"].includes(String(row.payment_status)));
      return status(String(record.payment_status), unpaid);
    }
    case "PAYPAL": {
      paypalLiveConfiguration();
      const saved = await createAdminClient().from("paypal_checkouts").select("*").eq("order_id", payment.order_id).maybeSingle();
      const checkout = saved.data as PayPalCheckout | null;
      if (saved.error || !checkout || checkout.payment_id !== payment.id || checkout.paypal_order_id !== reference)
        throw Error("Gateway reference mismatch");
      const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders/" + reference, "GET");
      const unit = verifyPayPalOrder(order, checkout);
      return status(order.status, order.status === "VOIDED" && !checkout.capture_id &&
        !(unit.payments?.captures?.length) && !(unit.payments?.authorizations?.length));
    }
    default: return status("MANUAL_PAYMENT");
  }
}

// Only called with server-owned order/payment IDs. Errors never release quota.
export async function syncFailedGatewayPayments(input: {
  orderIds?: string[]; method?: string; gatewayOrderId?: string;
  providerPaymentId?: string; limit?: number;
} = {}) {
  const admin = createAdminClient();
  const limit = Math.max(1, Math.min(input.limit ?? 24, 40));
  let query = admin.from("payments").select("id,order_id,method,gateway_order_id,gateway_payment_id,amount,currency,orders!inner(status)")
    .eq("status", "PENDING").eq("orders.status", "PENDING_PAYMENT")
    .in("method", input.method ? [input.method] : failureSyncMethods).not("gateway_order_id", "is", null)
    .order("gateway_status_checked_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: true }).limit(limit);
  if (input.orderIds) {
    if (!input.orderIds.length) return { checked: 0, failed: 0, releasedOrderIds: [] as string[] };
    query = query.in("order_id", input.orderIds);
  }
  if (input.gatewayOrderId) query = query.eq("gateway_order_id", input.gatewayOrderId);
  // Prevent repeated callbacks or checkout clicks from flooding providers.
  query = query.or("gateway_status_checked_at.is.null,gateway_status_checked_at.lt." + new Date(Date.now() - 15_000).toISOString());
  const found = await query;
  if (found.error) throw Error("Unable to check pending payments");
  const payments = (found.data ?? []) as PendingGatewayPayment[];
  const releasedOrderIds: string[] = [];
  let failed = 0, checkedCount = 0;
  const deadline = Date.now() + 90_000;
  // Small bounded batches keep provider requests and checkout latency controlled.
  for (let offset = 0; offset < payments.length; offset += 3) {
    if (Date.now() >= deadline) break;
    await Promise.all(payments.slice(offset, offset + 3).map(async payment => {
      checkedCount++;
      let state = "CHECK_UNAVAILABLE";
      try {
        const result = await verifiedGatewayFailure(payment, input.providerPaymentId);
        state = result.state;
        if (result.unpaidFailure) {
          const saved = await admin.rpc("fail_unpaid_gateway_payment", {
            p_payment_id: payment.id, p_method: payment.method,
            p_gateway_order_id: payment.gateway_order_id, p_gateway_status: result.state,
          });
          if (saved.error) throw Error("Unable to save payment failure");
          if (saved.data?.released) releasedOrderIds.push(payment.order_id);
        }
      } catch {
        failed++;
      }
      const checked = await admin.from("payments").update({
        gateway_status_checked_at: new Date().toISOString(), gateway_last_status: state.slice(0, 64),
      }).eq("id", payment.id).eq("status", "PENDING").eq("gateway_order_id", payment.gateway_order_id);
      if (checked.error) failed++;
    }));
  }
  return { checked: checkedCount, failed, releasedOrderIds };
}
