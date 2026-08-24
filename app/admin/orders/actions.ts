"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendEmail, sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { notifyPaidOrderInTelegram } from "@/lib/telegram-order-notification";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendVerifiedPaymentNotification } from "@/lib/verified-payment-notification";

function ordersRedirect(
  kind: "error" | "success",
  message: string,
  orderId?: string,
): never {
  const destination =
    orderId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    )
      ? `/admin/orders/${encodeURIComponent(orderId)}/receipt`
      : "/admin/orders";

  redirect(
    `${destination}?${kind}=${encodeURIComponent(message)}`,
  );
}

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }

  return user;
}

export async function verifyOrderPaymentManually(formData: FormData) {
  await requireAdministrator();

  const orderId = String(formData.get("order_id") ?? "").trim();
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const transactionId = String(
    formData.get("transaction_id") ?? "",
  ).trim();
  const confirmed = formData.get("payment_confirmed") === "on";
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(orderId) || !uuidPattern.test(paymentId)) {
    ordersRedirect("error", "Order payment details are invalid.", orderId);
  }

  if (transactionId.length < 6 || transactionId.length > 200) {
    ordersRedirect(
      "error",
      "Enter a valid transaction hash or payment reference.",
      orderId,
    );
  }

  if (!confirmed) {
    ordersRedirect(
      "error",
      "Confirm that the full payment was received before verification.",
      orderId,
    );
  }

  const admin = createAdminClient();
  const paymentResult = await admin
    .from("payments")
    .select("id, order_id, status, gateway_order_id")
    .eq("id", paymentId)
    .eq("order_id", orderId)
    .maybeSingle();
  const payment = paymentResult.data;

  if (paymentResult.error || !payment) {
    ordersRedirect(
      "error",
      paymentResult.error?.message ?? "Payment was not found.",
      orderId,
    );
  }

  if (payment.status === "VERIFIED") {
    ordersRedirect("success", "Payment is already verified.", orderId);
  }

  if (
    !["PENDING", "SUBMITTED"].includes(payment.status) ||
    !payment.gateway_order_id
  ) {
    ordersRedirect(
      "error",
      "This payment cannot be verified manually.",
      orderId,
    );
  }

  const completionResult = await admin.rpc("complete_binance_payment", {
    p_payment_id: payment.id,
    p_prepay_id: payment.gateway_order_id,
    p_transaction_id: transactionId,
  });

  if (completionResult.error) {
    ordersRedirect("error", completionResult.error.message, orderId);
  }

  try {
    await prepareOrderForManualFulfillment(orderId);
  } catch (error) {
    ordersRedirect(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to prepare the paid order for delivery.",
      orderId,
    );
  }

  await sendVerifiedPaymentNotification(orderId);
  await notifyPaidOrderInTelegram(orderId);

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  revalidatePath("/admin/payments");
  revalidatePath("/admin/gift-codes");

  ordersRedirect(
    "success",
    "Payment verified manually. The order is ready for delivery.",
    orderId,
  );
}

async function finalizeOrderWhenAllCodesSent(orderId: string) {
  const admin = createAdminClient();
  const items = await admin.from("order_items").select("id, quantity, fulfillment_mode").eq("order_id", orderId);
  if (items.error) return { completed: false, error: items.error.message };
  if (!(items.data ?? []).length) return { completed: false, error: null };
  for (const item of items.data ?? []) {
    if (item.fulfillment_mode === "PLAYER_ID_TOPUP") return { completed: false, error: null };
    const count = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("order_item_id", item.id).eq("status", "SOLD");
    if (count.error) return { completed: false, error: count.error.message };
    const refunded = await admin.from("order_item_refunds").select("quantity").eq("order_item_id", item.id).neq("status", "CANCELLED");
    if (refunded.error) return { completed: false, error: refunded.error.message };
    const refundedQuantity = (refunded.data ?? []).reduce((sum, row) => sum + row.quantity, 0);
    if ((count.count ?? 0) + refundedQuantity !== item.quantity) return { completed: false, error: null };
  }
  const update = await admin.from("orders").update({ status: "DELIVERED", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId).in("status", ["PAID", "PROCESSING"]);
  return { completed: !update.error, error: update.error?.message ?? null };
}

export async function finalizeManualOrderFromCodes(formData: FormData) {
  await requireAdministrator();
  const orderId = String(formData.get("order_id") ?? "");
  const result = await finalizeOrderWhenAllCodesSent(orderId);
  if (result.error) ordersRedirect("error", result.error, orderId);
  if (!result.completed) ordersRedirect("error", "Some denominations are not completed yet.", orderId);

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
      .order("created_at"),
  ]);

  if (orderResult.data && (itemResult.data ?? []).length > 0) {
    const itemIds = (itemResult.data ?? []).map((item) => item.id);
    const codeResult = await admin
      .from("gift_card_codes")
      .select("order_item_id, code")
      .in("order_item_id", itemIds)
      .eq("status", "SOLD")
      .order("sold_at");

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
      event: "ORDER_DELIVERED",
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
            ? "Customer delivery email failed:"
            : "Admin delivery email failed:",
          deliveryResult.reason,
        );
      }
    });
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  ordersRedirect("success", "Order completed.", orderId);
}

export async function approveWalletRefund(formData: FormData) {
  await requireAdministrator();
  const orderId = String(formData.get("order_id") ?? "").trim();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) ordersRedirect("error", "Order denomination is invalid.", orderId);
  if (!Number.isInteger(quantity) || quantity < 1) ordersRedirect("error", "Refund quantity must be at least 1.", orderId);
  if (reason.length < 3 || reason.length > 500) ordersRedirect("error", "Enter a valid refund reason.", orderId);

  const supabase = await createClient();
  const result = await supabase.rpc("create_order_item_wallet_refund", { p_order_item_id: itemId, p_quantity: quantity, p_reason: reason });
  if (result.error) ordersRedirect("error", result.error.message, orderId);

  const admin = createAdminClient();
  const refund = await admin.from("order_item_refunds")
    .select("amount, currency, customer_email, orders(order_number), order_items(product_name, option_name)")
    .eq("id", result.data).single();
  if (refund.data) {
    const order = Array.isArray(refund.data.orders) ? refund.data.orders[0] : refund.data.orders;
    const item = Array.isArray(refund.data.order_items) ? refund.data.order_items[0] : refund.data.order_items;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ingamepin.com";
    try {
      await sendEmail({
        to: refund.data.customer_email,
        subject: `Wallet refund approved for ${order?.order_number ?? "your order"}`,
        text: `A ${refund.data.currency} ${Number(refund.data.amount).toFixed(2)} wallet refund was approved for ${item?.option_name ?? item?.product_name ?? "your product"}. Create or sign in using this email and claim it at ${siteUrl}/account/wallet`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a"><h1>Wallet refund approved</h1><p>A <strong>${refund.data.currency} ${Number(refund.data.amount).toFixed(2)}</strong> refund was approved for ${item?.option_name ?? item?.product_name ?? "your product"}.</p><p>Create or sign in using this same email, verify it, and claim the refund from your wallet.</p><a href="${siteUrl}/account/wallet">Claim wallet refund</a></div>`,
      });
    } catch (error) { console.error("Refund approval email failed:", error); }
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  revalidatePath("/account/wallet");
  ordersRedirect("success", "Wallet refund approved. The customer can claim it using the payment email.", orderId);
}

export async function sendManualOrderItem(formData: FormData) {
  const administrator = await requireAdministrator();
  const orderId = String(formData.get("order_id") ?? ""); const itemId = String(formData.get("item_id") ?? "");
  const codes = String(formData.get("codes") ?? "").split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
  if (!orderId || !itemId) ordersRedirect("error", "Order item is invalid.", orderId);
  if (new Set(codes).size !== codes.length) ordersRedirect("error", "Duplicate delivery codes are not allowed.", orderId);
  const admin = createAdminClient();
  const itemResult = await admin.from("order_items").select("id, order_id, product_id, product_option_id, product_name, option_name, denomination, quantity, fulfillment_mode, products!inner(delivery_type, is_bulk_order)").eq("id", itemId).eq("order_id", orderId).eq("products.delivery_type", "MANUAL").maybeSingle();
  const item = itemResult.data; if (!item || item.fulfillment_mode === "PLAYER_ID_TOPUP") ordersRedirect("error", "This denomination cannot be sent as codes.", orderId);
  if (codes.length < 1) ordersRedirect("error", "Enter at least one delivery code.", orderId);
  const productRelation = item.products as unknown as
    | { is_bulk_order?: boolean }
    | Array<{ is_bulk_order?: boolean }>;
  const isBulkOrder = Array.isArray(productRelation)
    ? Boolean(productRelation[0]?.is_bulk_order)
    : Boolean(productRelation?.is_bulk_order);
  const existing = await admin
    .from("gift_card_codes")
    .select("id, code, product_id, product_option_id, order_item_id, status")
    .in("code", codes);
  if (existing.error) ordersRedirect("error", existing.error.message, orderId);
  for (const code of codes) {
    const row = (existing.data ?? []).find((entry) => entry.code === code);
    const alreadyDeliveredToThisItem =
      row?.status === "SOLD" && row.order_item_id === item.id;
    if (
      row &&
      !alreadyDeliveredToThisItem &&
      (row.status !== "AVAILABLE" ||
        row.product_id !== item.product_id ||
        (item.product_option_id && row.product_option_id !== item.product_option_id))
    ) {
      ordersRedirect(
        "error",
        `Code ${code} is unavailable or belongs to another denomination.`,
        orderId,
      );
    }
  }
  const codesToDeliver = codes.filter((code) => {
    const row = (existing.data ?? []).find((entry) => entry.code === code);
    return !(row?.status === "SOLD" && row.order_item_id === item.id);
  });
  const skippedCodeCount = codes.length - codesToDeliver.length;
  const deliveredResult = await admin
    .from("gift_card_codes")
    .select("id", { count: "exact", head: true })
    .eq("order_item_id", item.id)
    .eq("status", "SOLD");
  if (deliveredResult.error) ordersRedirect("error", deliveredResult.error.message, orderId);
  const deliveredCount = deliveredResult.count ?? 0;
  const refundResult = await admin.from("order_item_refunds").select("quantity").eq("order_item_id", item.id).neq("status", "CANCELLED");
  if (refundResult.error) ordersRedirect("error", refundResult.error.message, orderId);
  const refundedQuantity = (refundResult.data ?? []).reduce((sum, row) => sum + row.quantity, 0);
  const remainingQuantity = item.quantity - deliveredCount - refundedQuantity;
  if (remainingQuantity <= 0) {
    ordersRedirect("error", `${item.product_name} already has all ${item.quantity} ordered code(s).`, orderId);
  }
  if (codesToDeliver.length > remainingQuantity) {
    ordersRedirect(
      "error",
      `Only ${remainingQuantity} code(s) remain for ${item.product_name}. You cannot deliver more than the ordered quantity of ${item.quantity}.`,
      orderId,
    );
  }
  if (!isBulkOrder && codesToDeliver.length !== remainingQuantity) {
    ordersRedirect("error", `${item.product_name} requires exactly ${remainingQuantity} remaining code(s).`, orderId);
  }
  if (codesToDeliver.length < 1) {
    ordersRedirect(
      "success",
      `All ${skippedCodeCount} code(s) were already delivered to this order. Nothing was sent twice.`,
      orderId,
    );
  }
  for (const code of codesToDeliver) {
    const row = (existing.data ?? []).find((entry) => entry.code === code);
    const result = row ? await admin.from("gift_card_codes").update({ status: "SOLD", order_item_id: item.id, reserved_at: new Date().toISOString(), sold_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id) : await admin.from("gift_card_codes").insert({ product_id: item.product_id, product_option_id: item.product_option_id, order_item_id: item.id, denomination: item.denomination, code, status: "SOLD", reserved_at: new Date().toISOString(), sold_at: new Date().toISOString(), created_by: administrator.id });
    if (result.error) ordersRedirect("error", result.error.message, orderId);
  }
  const orderResult = await admin.from("orders").select("order_number, customer_name, customer_email, total, currency, status").eq("id", orderId).single();
  if (orderResult.data) await sendOrderStatusEmails({ orderId, event: "PRODUCT_SENT", orderNumber: orderResult.data.order_number, customerName: orderResult.data.customer_name ?? "Customer", customerEmail: orderResult.data.customer_email, total: Number(orderResult.data.total), currency: orderResult.data.currency, orderStatus: orderResult.data.status, deliveredItems: [{ productName: item.product_name, optionName: item.option_name, codes: codesToDeliver }] });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  ordersRedirect(
    "success",
    `${codesToDeliver.length} new code(s) sent successfully.${skippedCodeCount > 0 ? ` ${skippedCodeCount} code(s) already delivered to this order were safely skipped.` : ""}`,
    orderId,
  );
}

export async function completeManualOrderItem(formData: FormData) {
  await requireAdministrator(); const orderId = String(formData.get("order_id") ?? ""); const itemId = String(formData.get("item_id") ?? ""); const admin = createAdminClient();
  const itemResult = await admin.from("order_items").select("id, quantity, option_name, product_name").eq("id", itemId).eq("order_id", orderId).maybeSingle(); if (!itemResult.data) ordersRedirect("error", "Order item was not found.", orderId);
  const sent = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("order_item_id", itemId).eq("status", "SOLD");
  const itemRefunds = await admin.from("order_item_refunds").select("quantity").eq("order_item_id", itemId).neq("status", "CANCELLED");
  if (itemRefunds.error) ordersRedirect("error", itemRefunds.error.message, orderId);
  const itemRefundedQuantity = (itemRefunds.data ?? []).reduce((sum, row) => sum + row.quantity, 0);
  if ((sent.count ?? 0) + itemRefundedQuantity !== itemResult.data.quantity) ordersRedirect("error", "Delivered and refunded quantities must exactly match the ordered quantity.", orderId);
  const items = await admin.from("order_items").select("id, quantity, fulfillment_mode").eq("order_id", orderId);
  if (items.error) ordersRedirect("error", items.error.message, orderId);
  let allComplete = (items.data ?? []).length > 0;
  for (const item of items.data ?? []) {
    if (item.fulfillment_mode === "PLAYER_ID_TOPUP") { allComplete = false; continue; }
    const count = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("order_item_id", item.id).eq("status", "SOLD");
    if (count.error) ordersRedirect("error", count.error.message, orderId);
    const refunded = await admin.from("order_item_refunds").select("quantity").eq("order_item_id", item.id).neq("status", "CANCELLED");
    if (refunded.error) ordersRedirect("error", refunded.error.message, orderId);
    const refundedQuantity = (refunded.data ?? []).reduce((sum, row) => sum + row.quantity, 0);
    if ((count.count ?? 0) + refundedQuantity !== item.quantity) allComplete = false;
  }
  if (allComplete) {
    const completed = await admin.from("orders").update({ status: "DELIVERED", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId).in("status", ["PAID", "PROCESSING"]);
    if (completed.error) ordersRedirect("error", completed.error.message, orderId);
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  ordersRedirect("success", allComplete ? "All denominations completed. Order completed." : `${itemResult.data.option_name ?? itemResult.data.product_name} completed.`, orderId);
}

export async function completeManualOrder(
  formData: FormData,
) {
  const administrator =
    await requireAdministrator();
  const orderId = String(
    formData.get("order_id") ?? "",
  ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  ) {
    ordersRedirect("error", "Order ID is invalid.", orderId);
  }

  const admin = createAdminClient();
  const itemResult = await admin
    .from("order_items")
    .select(
      "id, product_name, option_name, fulfillment_mode, quantity, products!inner(delivery_type)",
    )
    .eq("order_id", orderId)
    .eq("products.delivery_type", "MANUAL")
    .order("created_at", {
      ascending: true,
    });

  if (itemResult.error) {
    ordersRedirect(
      "error",
      itemResult.error.message,
      orderId,
    );
  }

  if ((itemResult.data ?? []).length === 0) {
    ordersRedirect(
      "error",
      "This order has no products to deliver.",
      orderId,
    );
  }

  const serviceItemId = String(formData.get("service_item_id") ?? "").trim();
  if (serviceItemId) {
    if ((itemResult.data ?? []).length !== 1) {
      ordersRedirect("error", "Complete the other order items before using UID/account delivery.", orderId);
    }
    const serviceItem = (itemResult.data ?? []).find((item) => item.id === serviceItemId);
    if (!serviceItem) {
      ordersRedirect("error", "The UID/account delivery item is invalid.", orderId);
    }
    const serviceModeUpdate = await admin
      .from("order_items")
      .update({ fulfillment_mode: "PLAYER_ID_TOPUP" })
      .eq("id", serviceItemId)
      .eq("order_id", orderId);
    if (serviceModeUpdate.error) {
      ordersRedirect("error", serviceModeUpdate.error.message, orderId);
    }
    serviceItem.fulfillment_mode = "PLAYER_ID_TOPUP";
  }

  const deliveries = (
    itemResult.data ?? []
  ).map((item) => {
    if (
      item.fulfillment_mode ===
      "PLAYER_ID_TOPUP"
    ) {
      return {
        orderItemId: item.id,
        completed:
          item.id === serviceItemId ||
          formData.get(
            `completed_${item.id}`,
          ) === "on",
        codes: [],
      };
    }

    const codes = String(
      formData.get(`codes_${item.id}`) ??
        "",
    )
      .split(/\r?\n/)
      .map((code) => code.trim())
      .filter(Boolean);

    return {
      orderItemId: item.id,
      completed: false,
      codes,
    };
  });

  const completionResult = await admin.rpc(
    "complete_manual_order",
    {
      p_order_id: orderId,
      p_admin_user_id:
        administrator.id,
      p_deliveries: deliveries,
    },
  );

  if (completionResult.error) {
    ordersRedirect(
      "error",
      completionResult.error.message,
      orderId,
    );
  }

  const orderResult = await admin
    .from("orders")
    .select(
      "order_number, customer_name, customer_email, total, currency, status",
    )
    .eq("id", orderId)
    .single();

  if (orderResult.error) {
    console.error(
      "Completed order email lookup failed:",
      orderResult.error,
    );
  } else {
    const itemIds = (
      itemResult.data ?? []
    ).map((item) => item.id);
    const codeResult = await admin
      .from("gift_card_codes")
      .select("order_item_id, code")
      .in("order_item_id", itemIds)
      .eq("status", "SOLD")
      .order("sold_at", {
        ascending: true,
      });

    if (codeResult.error) {
      console.error(
        "Completed order code lookup failed:",
        codeResult.error,
      );
    }

    const deliveredItems = (
      itemResult.data ?? []
    )
      .map((item) => ({
        productName: item.product_name,
        optionName: item.option_name,
        codes: (codeResult.data ?? [])
          .filter(
            (code) =>
              code.order_item_id ===
              item.id,
          )
          .map((code) => code.code),
      }))
      .filter(
        (item) => item.codes.length > 0,
      );
    const order = orderResult.data;
    const deliveryResults =
      await sendOrderStatusEmails({
        orderId,
        event: "ORDER_DELIVERED",
        orderNumber:
          order.order_number,
        customerName:
          order.customer_name ??
          "Customer",
        customerEmail:
          order.customer_email,
        total: Number(order.total),
        currency: order.currency,
        orderStatus: order.status,
        deliveredItems,
      });

    deliveryResults.forEach(
      (deliveryResult, index) => {
        if (
          deliveryResult.status ===
          "rejected"
        ) {
          console.error(
            index === 0
              ? "Customer delivery email failed:"
              : "Admin delivery email failed:",
            deliveryResult.reason,
          );
        }
      },
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  revalidatePath("/admin/gift-codes");

  ordersRedirect(
    "success",
    "Products sent and order completed.",
    orderId,
  );
}
