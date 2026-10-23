import { retryPaymentOptions } from "@/lib/checkout-payment-options";
import { businessSessionReady } from "@/lib/business-security";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ownsPurchase, purchaseIdentity, tokenHash } from "@/lib/purchase-access";
import { privateJson, requestLimit, sameOrigin } from "@/lib/request-security";
import { assertCheckoutOpen } from "@/lib/checkout-payment-session";
import { retryPaymentMethods, retryPaymentPath } from "@/lib/checkout-expiry";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { sendOrderStatusEmails, sendWalletDebitEmails } from "@/lib/email";
import { notifyPaidOrderInTelegram } from "@/lib/telegram-order-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return privateJson({ error: "Request denied." }, 403);
  try {
    const identity = await purchaseIdentity();
    if (!identity) return privateJson({ error: "Sign in or verify your email to retry this payment." }, 401);
    const blocked = await requestLimit(request, "retry-order-payment", 15, 60);
    if (blocked) return blocked;
    const body = await request.json();
    const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim().toUpperCase() : "";
    if (!/^[A-Z0-9-]{8,100}$/.test(orderNumber)) return privateJson({ error: "Order not found." }, 404);
    const admin = createAdminClient();
    const found = await admin.from("orders")
      .select("id,order_number,customer_id,customer_email,customer_name,total,payment_fee,currency,sales_channel,status,paid_at")
      .eq("order_number", orderNumber).maybeSingle();
    if (found.error) throw Error("Unable to read this order.");
    const order = found.data;
    if (!order || !ownsPurchase(identity, order)) return privateJson({ error: "Order not found." }, 404);
    if (order.sales_channel === "BUSINESS" && (!identity.userId || !(await businessSessionReady(await createClient(), identity.userId))))
      return privateJson({ error: "Sign in to the B2B portal and complete Google Authenticator verification." }, 403);
    const receiptUrl = identity.source === "account"
      ? `${order.sales_channel === "BUSINESS" ? "/account/portal/orders" : "/account/orders"}/${order.id}`
      : `/track-order/${encodeURIComponent(order.order_number)}`;
    // A retry after a successful wallet response was lost must never debit twice.
    if (order.paid_at) return privateJson({ paid: true, receiptUrl });
    await assertCheckoutOpen(order.id);
    const payment = await admin.from("payments").select("method,status,checkout_variant,checkout_revision,verified_at,submitted_at,transaction_id,screenshot_url").eq("order_id", order.id).single();
    if (payment.error || !retryPaymentMethods[payment.data.method]) throw Error("This payment method cannot be resumed online. Please contact support.");
    let method = payment.data.method;
    let preparedChange: { id: string; orderNumber: string; totalAmount: number; currency: string; paymentMethod: string; checkoutVariant: string; createdAt: string; expiresAt: string } | null = null;
    const accessToken = randomBytes(32).toString("base64url");
    if (body.action === "options" || typeof body.paymentMethod === "string") {
      const { data: { user } } = await (await createClient()).auth.getUser();
      const walletAllowed = Boolean(user?.email_confirmed_at && user.id === identity.userId &&
        user.app_metadata?.wallet_disabled !== true && user.email?.trim().toLowerCase() === order.customer_email?.trim().toLowerCase() &&
        (!order.customer_id || order.customer_id === user.id));
      const options = await retryPaymentOptions(admin, order, payment.data, walletAllowed);
      if (body.action === "options") return privateJson({ ...options, currency: order.currency });
      const choice = options.choices.find(item => item.value === body.paymentMethod);
      if (!choice) throw Error("This payment method is not available for this order.");
      if (body.revision !== options.revision || body.expectedTotal !== choice.total)
        throw Error("Payment details changed. Reopen payment options to confirm the current total.");
      if (choice.method === "WALLET" && body.action !== "pay-wallet")
        return privateJson({ error: "Confirm Pay with wallet to make this payment." }, 409);
      if (choice.method !== "NOWPAYMENTS") {
        const changed = await admin.rpc("switch_checkout_payment_method", { p_order_id: order.id, p_method: choice.method,
          p_variant: choice.value, p_access_hash: tokenHash(accessToken), p_expected_revision: options.revision, p_expected_total: choice.total });
        if (changed.error || !changed.data) throw Error(changed.error?.code === "P0001" ? changed.error.message : "Unable to change the payment method.");
        preparedChange = changed.data;
        method = choice.method;
        order.total = changed.data.totalAmount;
      }
    }
    if (method === "WALLET" && body.action !== "pay-wallet")
      return privateJson({ error: "Confirm Pay with wallet to make this payment." }, 409);
    if (method === "WALLET") {
      const { data: { user }, error } = await (await createClient()).auth.getUser();
      if (error || !user?.email_confirmed_at || user.id !== identity.userId || user.app_metadata?.wallet_disabled === true ||
          user.email?.trim().toLowerCase() !== order.customer_email?.trim().toLowerCase() ||
          (order.customer_id && order.customer_id !== user.id))
        return privateJson({ error: "Sign in to the account that owns this wallet." }, 403);
      const linked = await admin.from("orders").update({ customer_id: user.id }).eq("id", order.id)
        .or(`customer_id.is.null,customer_id.eq.${user.id}`).eq("status", "PENDING_PAYMENT").select("id").single();
      if (linked.error) throw Error("Unable to connect this order to your wallet.");
      const paid = await admin.rpc("pay_order_with_wallet", { p_order_id: order.id, p_user_id: user.id });
      if (paid.error) throw Error(paid.error.code === "P0001" ? paid.error.message : "Unable to confirm wallet payment. Refresh this order before trying again.");
      // The debit is committed. Notification errors must not invite another payment.
      try {
        const prepared = await prepareOrderForManualFulfillment(order.id);
        await Promise.allSettled([
          sendWalletDebitEmails({ orderNumber: order.order_number, customerName: order.customer_name ?? "Customer",
            customerEmail: order.customer_email, amount: Number(order.total), currency: order.currency,
            balanceAfter: Number(paid.data?.walletBalanceAfter ?? paid.data?.balanceAfter ?? 0) }),
          sendOrderStatusEmails({ orderId: order.id, event: "PAYMENT_APPROVED", orderNumber: order.order_number,
            customerName: order.customer_name ?? "Customer", customerEmail: order.customer_email,
            total: Number(order.total), currency: order.currency, orderStatus: prepared.status }),
          notifyPaidOrderInTelegram(order.id),
        ]);
      } catch { console.error("Wallet retry paid; fulfillment follow-up requires review", order.id); }
      return privateJson({ paid: true, receiptUrl });
    }
    const prepared = preparedChange ? { data: preparedChange, error: null } : await admin.rpc("prepare_order_payment_retry", { p_order_id: order.id, p_access_hash: tokenHash(accessToken) });
    if (prepared.error || !prepared.data) throw Error(prepared.error?.code === "P0001" ? prepared.error.message : "Unable to resume this order.");
    const data = prepared.data;
    return privateJson({
      pendingOrder: { id: data.orderNumber, databaseId: data.id, orderNumber: data.orderNumber,
        accessToken, customer: { email: order.customer_email }, totalAmount: Number(data.totalAmount),
        currency: data.currency, paymentMethod: data.checkoutVariant || retryPaymentMethods[data.paymentMethod],
        createdAt: data.createdAt, expiresAt: data.expiresAt, status: "PENDING_PAYMENT" },
      nextUrl: retryPaymentPath(data.paymentMethod),
    });
  } catch (error) {
    return privateJson({ error: error instanceof Error ? error.message : "Unable to retry payment." }, 409);
  }
}
