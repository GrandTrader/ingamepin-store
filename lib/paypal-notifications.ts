import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { sendOrderStatusEmails } from "@/lib/email";
import { notifyPaidOrderInTelegram } from "@/lib/telegram-order-notification";

export async function finishPayPalOrder(orderId: string) {
  const admin = createAdminClient();
  const saved = await admin.from("paypal_checkouts").select("capture_id,delivery_pending,notifications_sent_at")
    .eq("order_id", orderId).single();
  if (saved.error || !saved.data?.capture_id) throw Error("Payment is not confirmed.");
  if (saved.data.delivery_pending) throw Error("Paid order is awaiting delivery recovery.");
  await prepareOrderForManualFulfillment(orderId);
  if (saved.data.notifications_sent_at) return;
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const claim = await admin.from("paypal_checkouts").update({ notification_claimed_at: now })
    .eq("order_id", orderId).is("notifications_sent_at", null)
    .or(`notification_claimed_at.is.null,notification_claimed_at.lt.${cutoff}`).select("order_id").maybeSingle();
  if (claim.error || !claim.data) throw Error("Order notifications are being processed.");
  try {
    const result = await admin.from("orders").select("order_number,customer_name,customer_email,total,currency,status").eq("id", orderId).single();
    if (result.error) throw Error("Unable to load paid order.");
    const order = result.data;
    const items = await admin.from("order_items").select("id,product_name,option_name").eq("order_id", orderId);
    if (items.error || !items.data?.length) throw Error("Unable to load delivery details.");
    const codes = await admin.from("gift_card_codes").select("order_item_id,code")
      .in("order_item_id", items.data.map(item => item.id)).eq("status", "SOLD");
    if (codes.error) throw Error("Unable to load delivered codes.");
    const deliveredItems = items.data.map(item => ({ productName: item.product_name, optionName: item.option_name,
      codes: (codes.data ?? []).filter(code => code.order_item_id === item.id).map(code => code.code),
    })).filter(item => item.codes.length > 0);
    const emails = await sendOrderStatusEmails({ orderId, event: "PAYMENT_APPROVED", orderNumber: order.order_number,
      customerName: order.customer_name || "Customer", customerEmail: order.customer_email,
      total: Number(order.total), currency: order.currency, orderStatus: order.status, deliveredItems });
    if (emails.some(result => result.status === "rejected")) throw Error("Order email needs retry.");
    await notifyPaidOrderInTelegram(orderId);
    const updated = await admin.from("paypal_checkouts").update({ notifications_sent_at: new Date().toISOString(), notification_claimed_at: null })
      .eq("order_id", orderId).eq("notification_claimed_at", now);
    if (updated.error) throw Error("Unable to record order notification.");
  } catch (error) {
    await admin.from("paypal_checkouts").update({ notification_claimed_at: null }).eq("order_id", orderId).eq("notification_claimed_at", now);
    throw error;
  }
}
