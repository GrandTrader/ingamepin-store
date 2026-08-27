"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";

type BillingDetails = {
  fullName: string;
  companyName: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  taxpayerId: string;
};

export async function saveCustomerInvoice(
  orderId: string,
  orderItemId: string | null,
  details: BillingDetails,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Please sign in to generate this invoice." };

  const admin = createAdminClient();
  const orderResult = await admin
    .from("orders")
    .select("id, order_number, customer_name, customer_email, currency, subtotal, discount, total, status, created_at, paid_at")
    .eq("id", orderId)
    .eq("customer_email", user.email.toLowerCase())
    .maybeSingle();

  if (orderResult.error || !orderResult.data) return { error: "Order was not found." };
  if (orderResult.data.status !== "DELIVERED") return { error: "Invoice is available only after the order is completed." };

  let itemsQuery = admin
    .from("order_items")
    .select("id, product_name, option_name, denomination, platform, quantity, unit_price, total_price")
    .eq("order_id", orderId)
    .order("created_at");
  if (orderItemId) itemsQuery = itemsQuery.eq("id", orderItemId);
  const itemsResult = await itemsQuery;
  const items = itemsResult.data ?? [];
  if (itemsResult.error || items.length === 0) return { error: "Order product was not found." };

  const deliveredCodes = await getAllDeliveredCodes(items.map((item) => item.id));
  const deliveredByItem = new Map<string, number>();
  for (const code of deliveredCodes) {
    if (code.order_item_id) deliveredByItem.set(code.order_item_id, (deliveredByItem.get(code.order_item_id) ?? 0) + 1);
  }
  if (items.some((item) => (deliveredByItem.get(item.id) ?? 0) < Number(item.quantity))) {
    return { error: "Invoice is unavailable until every included product is delivered." };
  }

  let existingQuery = admin
    .from("saved_invoices")
    .select("id, invoice_data")
    .eq("source", "CUSTOMER_ORDER")
    .eq("order_id", orderId);
  existingQuery = orderItemId
    ? existingQuery.eq("order_item_id", orderItemId)
    : existingQuery.is("order_item_id", null);
  const existing = await existingQuery.maybeSingle();
  if (existing.data) return { error: null, invoiceId: existing.data.id, invoiceData: existing.data.invoice_data, alreadyExists: true };

  const subtotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);
  const orderSubtotal = Number(orderResult.data.subtotal);
  const discount = orderItemId && orderSubtotal > 0
    ? Number(orderResult.data.discount) * (subtotal / orderSubtotal)
    : Number(orderResult.data.discount);
  const total = Math.max(subtotal - discount, 0);
  const itemIndex = orderItemId
    ? (await admin.from("order_items").select("id").eq("order_id", orderId).order("created_at")).data?.findIndex((item) => item.id === orderItemId) ?? 0
    : -1;
  const invoiceNumber = orderItemId
    ? `${orderResult.data.order_number}-${String(itemIndex + 1).padStart(2, "0")}`
    : orderResult.data.order_number;

  const paymentResult = await admin.from("payments").select("method, status, transaction_id, gateway_payment_id, verified_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const invoiceData = {
    orderId,
    orderItemId,
    orderNumber: orderResult.data.order_number,
    invoiceNumber,
    customerEmail: orderResult.data.customer_email,
    currency: orderResult.data.currency,
    subtotal,
    discount,
    total,
    status: orderResult.data.status,
    createdAt: orderResult.data.created_at,
    paidAt: orderResult.data.paid_at,
    items: items.map((item) => ({ id: item.id, productName: item.product_name, optionName: item.option_name || String(item.denomination ?? "Standard option"), platform: item.platform, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), totalPrice: Number(item.total_price) })),
    payment: { method: paymentResult.data?.method ?? "Recorded payment", status: paymentResult.data?.status ?? "PAID", transactionId: paymentResult.data?.transaction_id || paymentResult.data?.gateway_payment_id || "", verifiedAt: paymentResult.data?.verified_at ?? orderResult.data.paid_at },
    billing: details,
  };

  const { error } = await supabase.auth.updateUser({
    data: {
      billing_full_name: details.fullName.slice(0, 150),
      billing_company_name: details.companyName.slice(0, 150),
      billing_country: details.country.slice(0, 150),
      billing_address_line_1: details.addressLine1.slice(0, 200),
      billing_address_line_2: details.addressLine2.slice(0, 200),
      billing_city: details.city.slice(0, 100),
      billing_state: details.state.slice(0, 100),
      billing_postal_code: details.postalCode.slice(0, 30),
      billing_taxpayer_id: details.taxpayerId.slice(0, 100),
    },
  });

  if (error) return { error: error.message };

  const inserted = await admin.from("saved_invoices").insert({
    invoice_number: invoiceNumber,
    source: "CUSTOMER_ORDER",
    order_id: orderId,
    order_item_id: orderItemId,
    customer_user_id: user.id,
    customer_name: details.fullName,
    customer_email: orderResult.data.customer_email,
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_status: "PAID",
    currency: orderResult.data.currency,
    total,
    invoice_data: invoiceData,
    created_by: user.id,
  }).select("id").single();

  if (inserted.error) {
    if (inserted.error.code === "23505") return { error: "An invoice already exists for this order or product." };
    return { error: inserted.error.message };
  }
  return { error: null, invoiceId: inserted.data.id, invoiceData, alreadyExists: false };
}
