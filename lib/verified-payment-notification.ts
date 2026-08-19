import { sendOrderStatusEmails } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendVerifiedPaymentNotification(orderId: string) {
  const admin = createAdminClient();
  const [orderResult, itemResult] = await Promise.all([
    admin
      .from("orders")
      .select(
        "order_number, customer_name, customer_email, total, currency, status",
      )
      .eq("id", orderId)
      .single(),
    admin
      .from("order_items")
      .select("id, product_name, option_name")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  if (orderResult.error || itemResult.error) {
    console.error(
      "Manual payment notification lookup failed:",
      orderResult.error ?? itemResult.error,
    );
    return;
  }

  const itemIds = (itemResult.data ?? []).map((item) => item.id);
  const codeResult = itemIds.length
    ? await admin
        .from("gift_card_codes")
        .select("order_item_id, code")
        .in("order_item_id", itemIds)
        .eq("status", "SOLD")
        .order("sold_at", { ascending: true })
    : { data: [], error: null };

  if (codeResult.error) {
    console.error(
      "Manual payment delivered-code lookup failed:",
      codeResult.error,
    );
    return;
  }

  const deliveredItems = (itemResult.data ?? [])
    .map((item) => ({
      productName: item.product_name,
      optionName: item.option_name,
      codes: (codeResult.data ?? [])
        .filter((code) => code.order_item_id === item.id)
        .map((code) => code.code),
    }))
    .filter((item) => item.codes.length > 0);
  const order = orderResult.data;
  const deliveryResults = await sendOrderStatusEmails({
    orderId,
    event: "PAYMENT_APPROVED",
    orderNumber: order.order_number,
    customerName: order.customer_name ?? "Customer",
    customerEmail: order.customer_email,
    total: Number(order.total),
    currency: order.currency,
    orderStatus: order.status,
    deliveredItems,
  });

  deliveryResults.forEach((deliveryResult, index) => {
    if (deliveryResult.status === "rejected") {
      console.error(
        index === 0
          ? "Customer payment email failed:"
          : "Admin payment email failed:",
        deliveryResult.reason,
      );
    }
  });
}
