import "server-only";

import nodemailer from "nodemailer";

import {
  isUnlimitedStock,
} from "@/lib/product-stock";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPaymentMethod } from "@/lib/payment-method-label";

type SendEmailInput = {
  from?: string;
  smtpUser?: string;
  smtpPassword?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type OrderEmailItem = {
  productName: string;
  optionName: string | null;
  denomination: number | null;
  platform: string | null;
  quantity: number;
};

type OrderCreatedEmailInput = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  total: number;
  currency: string;
  paymentMethod: string;
  status: string;
  items: OrderEmailItem[];
};

type SoldInventoryItem = {
  productName: string;
  optionName: string | null;
  denomination: number | null;
  quantitySold: number;
  remainingQuantity: number;
};

type OrderStatusEmailInput = {
  orderId: string;
  event: "PAYMENT_APPROVED" | "PAYMENT_REJECTED" | "PRODUCT_SENT" | "ORDER_DELIVERED";
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  currency: string;
  orderStatus: string;
  reason?: string | null;
  deliveredItems?: Array<{
    productName: string;
    optionName: string | null;
    codes: string[];
  }>;
};

type WalletDebitEmailInput = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  balanceAfter: number;
};

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function createTransporter(
  user = getRequiredEnvironmentVariable("SMTP_USER"),
  pass = getRequiredEnvironmentVariable("SMTP_PASSWORD"),
) {
  const port = Number(
    getRequiredEnvironmentVariable("SMTP_PORT"),
  );

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT is invalid.");
  }

  return nodemailer.createTransport({
    host: getRequiredEnvironmentVariable("SMTP_HOST"),
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user,
      pass,
    },
  });
}

export async function sendEmail({
  from,
  smtpUser,
  smtpPassword,
  to,
  subject,
  html,
  text,
  replyTo = SUPPORT_EMAIL,
}: SendEmailInput) {
  const recipient = to.trim().toLowerCase();

  if (recipient.length > 254 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(recipient)) {
    throw new Error("The recipient email address is invalid.");
  }

  const transporter = createTransporter(smtpUser, smtpPassword);

  return transporter.sendMail({
    from: from?.trim() || getRequiredEnvironmentVariable("SMTP_FROM"),
    to: recipient,
    replyTo,
    subject,
    html,
    text,
  });
}

export const SUPPORT_EMAIL = "support@ingamepin.com";
export const ORDER_NOTIFICATION_EMAIL = "noreply@ingamepin.com";

async function sendOrderEmail(
  input: Omit<
    SendEmailInput,
    "from" | "replyTo" | "smtpUser" | "smtpPassword"
  >,
) {
  const smtpUser = getRequiredEnvironmentVariable("ORDER_SMTP_USER");

  return sendEmail({
    ...input,
    from: `InGamePin <${smtpUser}>`,
    smtpUser,
    smtpPassword: getRequiredEnvironmentVariable("ORDER_SMTP_PASSWORD"),
    replyTo: SUPPORT_EMAIL,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "USD",
  }).format(value);
}

function formatOrderStatus(status: string) {
  return status === "DELIVERED"
    ? "COMPLETED"
    : status.replaceAll("_", " ");
}

function createCustomerOrderUrl(orderId: string, orderNumber: string) {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ingamepin.com"
  ).replace(/\/$/, "");

  const query = new URLSearchParams({
    orderId,
    orderNumber,
  });

  return `${siteUrl}/account/orders?${query.toString()}`;
}

type ReceiptTone = "pending" | "success" | "neutral" | "error";

function getReceiptStatus(status: string): { label: string; tone: ReceiptTone } {
  switch (status) {
    case "PENDING_PAYMENT": return { label: "Awaiting payment", tone: "pending" };
    case "PAYMENT_REVIEW": return { label: "Payment under review", tone: "pending" };
    case "PAID": return { label: "Payment confirmed", tone: "success" };
    case "PROCESSING": return { label: "Preparing your order", tone: "success" };
    case "DELIVERED": return { label: "Order completed", tone: "success" };
    case "CANCELLED": return { label: "Order cancelled", tone: "neutral" };
    case "REFUNDED": return { label: "Order refunded", tone: "neutral" };
    default: return { label: formatOrderStatus(status), tone: "neutral" };
  }
}

function receiptTotalLabel(status: string) {
  if (status === "PENDING_PAYMENT") return "Total due";
  return ["PAID", "PROCESSING", "DELIVERED"].includes(status) ? "Total paid" : "Order total";
}

function createReceiptTotalHtml(label: string, amount: string, currency: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:20px">
      <tr>
        <td style="padding:20px 12px 20px 0;border-top:1px solid #e1e8ee;vertical-align:middle">
          <strong style="font-size:15px">${escapeHtml(label)}</strong>
          <div style="font-size:13px;line-height:20px;color:#586a7c">${escapeHtml(currency || "USD")}</div>
        </td>
        <td align="right" style="padding:20px 0;border-top:1px solid #e1e8ee;vertical-align:middle;font-size:28px;line-height:34px;font-weight:700;word-break:break-word">${escapeHtml(amount)}</td>
      </tr>
    </table>`;
}

// Tables and inline styles keep the receipt readable when an email client strips CSS.
// contentHtml is composed only by the escaped, server-owned templates below.
function createReceiptHtml({
  title, intro, orderNumber, status, contentHtml, actionUrl,
  actionLabel = "View your order", paymentMethod, note,
}: {
  title: string;
  intro: string;
  orderNumber: string;
  status: { label: string; tone: ReceiptTone };
  contentHtml: string;
  actionUrl: string;
  actionLabel?: string;
  paymentMethod?: string;
  note?: string;
}) {
  const colors = {
    pending: { background: "#fff5de", color: "#865306" },
    success: { background: "#e8f8ef", color: "#11633f" },
    neutral: { background: "#edf2f7", color: "#475569" },
    error: { background: "#fef2f2", color: "#991b1b" },
  }[status.tone];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — ${escapeHtml(orderNumber)}</title>
  <style>
    @media only screen and (max-width:480px) {
      .receipt-outer { padding:12px 8px !important; }
      .receipt-padding { padding:22px 18px !important; }
      .receipt-heading { font-size:25px !important; line-height:31px !important; }
      .receipt-meta { display:block !important; width:auto !important; }
      .receipt-payment { padding:12px 0 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;color:#17283b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(status.label)} · ${escapeHtml(orderNumber)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background-color:#f4f7fa">
    <tr><td class="receipt-outer" align="center" style="padding:28px 12px">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-spacing:0;border:1px solid #e1e8ee;border-top:5px solid #00bfd5;border-radius:16px;background-color:#ffffff;color:#17283b;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px">
        <tr><td class="receipt-padding" style="padding:24px 28px;border-bottom:1px solid #e1e8ee">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
            <td width="40" height="40" align="center" bgcolor="#00c6dc" style="width:40px;height:40px;border-radius:11px;background-color:#00c6dc;color:#06354a;font-size:20px;font-weight:700">iP</td>
            <td style="padding-left:11px"><div style="font-size:22px;line-height:26px;font-weight:700;color:#17283b">iNgame<span style="color:#007c91">PIN</span></div><div style="font-size:11px;line-height:17px;letter-spacing:1.2px;color:#586a7c">DIGITAL GAME STORE</div></td>
          </tr></table>
        </td></tr>
        <tr><td class="receipt-padding" style="padding:26px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td bgcolor="${colors.background}" style="padding:5px 11px;border-radius:20px;background-color:${colors.background};color:${colors.color};font-size:13px;line-height:20px;font-weight:700">${escapeHtml(status.label)}</td></tr></table>
          <h1 class="receipt-heading" style="margin:16px 0 10px;font-size:28px;line-height:35px;font-weight:700;color:#17283b">${escapeHtml(title)}</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#586a7c;overflow-wrap:anywhere">${escapeHtml(intro)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:22px;background-color:#f4f7fa;border-radius:10px"><tr><td style="padding:15px 16px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse"><tr>
              <td class="receipt-meta" style="vertical-align:top"><div style="font-size:13px;line-height:20px;color:#586a7c">Order number</div><div style="font-size:14px;line-height:22px;font-weight:700;word-break:break-all">${escapeHtml(orderNumber)}</div></td>
              ${paymentMethod ? `<td class="receipt-meta receipt-payment" style="width:42%;vertical-align:top;padding-left:16px"><div style="font-size:13px;line-height:20px;color:#586a7c">Payment method</div><div style="font-size:14px;line-height:22px;font-weight:700;word-break:break-word">${escapeHtml(paymentMethod)}</div></td>` : ""}
            </tr></table>
          </td></tr></table>
          ${contentHtml}
          ${note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 22px"><tr><td style="border-left:3px solid #00bfd5;padding-left:12px;color:#586a7c;font-size:14px;line-height:22px">${escapeHtml(note)}</td></tr></table>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate"><tr><td align="center" bgcolor="#00bfd5" style="border-radius:9px;background-color:#00bfd5;mso-padding-alt:14px 20px"><a href="${escapeHtml(actionUrl)}" style="display:block;padding:14px 20px;border-radius:9px;background-color:#00bfd5;color:#053144;font-size:16px;line-height:22px;font-weight:700;text-align:center;text-decoration:none">${escapeHtml(actionLabel)}</a></td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:18px 20px;background-color:#f4f7fa;border-radius:0 0 15px 15px;font-size:13px;line-height:22px;color:#586a7c">Questions about your order? Reply to this email.<br><a href="mailto:${SUPPORT_EMAIL}" style="color:#007c91;text-decoration:underline">${SUPPORT_EMAIL}</a></td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

function createOrderItemsHtml(items: OrderEmailItem[]) {
  return items
    .map((item) => {
      const details = [
        item.optionName,
        item.platform,
        item.denomination === null
          ? null
          : `Value: ${item.denomination}`,
      ]
        .filter(Boolean)
        .map((value) => escapeHtml(String(value)))
        .join(" · ");

      return `
        <tr>
          <td style="padding:14px 10px;border-bottom:1px solid #e2e8f0">
            <strong>${escapeHtml(item.productName)}</strong>
            ${details ? `<div style="margin-top:5px;color:#64748b;font-size:13px">${details}</div>` : ""}
          </td>
          <td style="padding:14px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">
            ${item.quantity}
          </td>
        </tr>
      `;
    })
    .join("");
}

function createReceiptItemsHtml(items: OrderEmailItem[]) {
  const rows = items.map((item) => {
    const details = [
      item.optionName,
      item.platform,
      item.denomination === null || item.optionName?.trim() === String(item.denomination)
        ? null
        : `Value: ${item.denomination}`,
    ].filter(Boolean).map((value) => escapeHtml(String(value))).join(" · ");
    return `<tr>
      <td style="padding:14px 12px 14px 0;vertical-align:top;border-bottom:1px solid #e1e8ee;word-break:break-word"><strong style="font-size:15px;line-height:23px">${escapeHtml(item.productName)}</strong>${details ? `<div style="margin-top:4px;font-size:13px;line-height:21px;color:#586a7c">${details}</div>` : ""}</td>
      <td align="right" style="width:64px;padding:14px 0;vertical-align:top;border-bottom:1px solid #e1e8ee;font-size:15px;line-height:23px;font-weight:700">${item.quantity}</td>
    </tr>`;
  }).join("");
  if (!rows) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0" aria-label="Order items" style="width:100%;table-layout:fixed;border-collapse:collapse">
    <thead><tr><th scope="col" align="left" style="font-size:13px;font-weight:400;line-height:20px;color:#586a7c">Product</th><th scope="col" align="right" style="width:64px;font-size:13px;font-weight:400;line-height:20px;color:#586a7c">Quantity</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function loadSoldInventory(orderId: string) {
  const admin = createAdminClient();
  const itemResult = await admin
    .from("order_items")
    .select(
      "product_name, option_name, denomination, quantity, product_option_id",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemResult.error) {
    console.error("Order inventory email query failed:", itemResult.error);
    return [] as SoldInventoryItem[];
  }

  const optionIds = Array.from(
    new Set(
      (itemResult.data ?? [])
        .map((item) => item.product_option_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (optionIds.length === 0) {
    return [] as SoldInventoryItem[];
  }

  const optionResult = await admin
    .from("product_options")
    .select("id, stock_quantity")
    .in("id", optionIds);

  if (optionResult.error) {
    console.error("Product stock email query failed:", optionResult.error);
    return [] as SoldInventoryItem[];
  }

  const stockByOption = new Map(
    (optionResult.data ?? []).map((option) => [
      option.id,
      Number(option.stock_quantity),
    ]),
  );

  return (itemResult.data ?? []).flatMap((item) => {
    if (!item.product_option_id) return [];

    const remainingQuantity = stockByOption.get(item.product_option_id);
    if (remainingQuantity === undefined) return [];

    return [{
      productName: item.product_name,
      optionName: item.option_name,
      denomination:
        item.denomination === null ? null : Number(item.denomination),
      quantitySold: Number(item.quantity),
      remainingQuantity,
    }];
  });
}

function createSoldInventoryHtml(items: SoldInventoryItem[]) {
  if (items.length === 0) return "";

  const rows = items.map((item) => {
    const optionLabel = item.optionName
      || (item.denomination === null
        ? "Default option"
        : `Denomination: ${item.denomination}`);
    const remainingLabel = isUnlimitedStock(item.remainingQuantity)
      ? "Unlimited"
      : item.remainingQuantity.toLocaleString("en-IN");

    return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0">
          <strong>${escapeHtml(item.productName)}</strong>
          <div style="margin-top:4px;color:#64748b;font-size:13px">${escapeHtml(optionLabel)}</div>
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${item.quantitySold}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800">${remainingLabel}</td>
      </tr>
    `;
  }).join("");

  return `
    <h2 style="margin-top:26px;font-size:20px">Inventory after sale</h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f1f5f9;color:#475569;font-size:13px">
          <th style="padding:10px;text-align:left">Product / denomination</th>
          <th style="padding:10px;text-align:center">Sold</th>
          <th style="padding:10px;text-align:right">Available</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export async function sendOrderCreatedEmails({
  orderId,
  orderNumber,
  customerEmail,
  total,
  currency,
  paymentMethod,
  status,
  items,
}: OrderCreatedEmailInput) {
  const safeOrderNumber = escapeHtml(orderNumber);
  const itemRows = createOrderItemsHtml(items);
  const totalLabel = formatMoney(total, currency);
  const trackingUrl = createCustomerOrderUrl(orderId, orderNumber);

  const deliveryNote = status === "PENDING_PAYMENT" || status === "PAYMENT_REVIEW"
    ? "Delivery starts after your payment is confirmed."
    : status === "DELIVERED"
      ? "Your order is complete. Open your order page to access your delivery."
      : ["PAID", "PROCESSING"].includes(status)
        ? "We’re preparing your order. Follow its delivery status on your order page."
        : "Open your order page for the latest details.";
  const customerHtml = createReceiptHtml({
    title: "We’ve received your order.",
    intro: "Thanks for choosing InGamePin. Your order details are below.",
    orderNumber,
    status: getReceiptStatus(status),
    paymentMethod: formatPaymentMethod(paymentMethod),
    contentHtml: createReceiptItemsHtml(items) + createReceiptTotalHtml(receiptTotalLabel(status), totalLabel, currency),
    actionUrl: trackingUrl,
    note: deliveryNote,
  });

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <h1>New InGamePin order</h1>
      <p><strong>Order:</strong> ${safeOrderNumber}</p>
      <p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p>
      <p><strong>Total:</strong> ${escapeHtml(totalLabel)}</p>
      <p><strong>Payment:</strong> ${escapeHtml(formatPaymentMethod(paymentMethod))}</p>
      <table style="width:100%;border-collapse:collapse"><tbody>${itemRows}</tbody></table>
      <a href="https://ingamepin.com/admin/orders" style="display:inline-block;margin-top:20px;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Open admin orders</a>
    </div>
  `;

  return Promise.allSettled([
    sendOrderEmail({
      to: customerEmail,
      subject: `InGamePin order received — ${orderNumber}`,
      html: customerHtml,
      text: `Your InGamePin order ${orderNumber} has been created. Status: ${getReceiptStatus(status).label}. ${receiptTotalLabel(status)}: ${totalLabel} ${currency}. Payment method: ${formatPaymentMethod(paymentMethod)}. ${deliveryNote} Track it at ${trackingUrl}`,
    }),
    sendOrderEmail({
      to: ORDER_NOTIFICATION_EMAIL,
      subject: `New order ${orderNumber} — ${totalLabel}`,
      html: adminHtml,
      text: `New order ${orderNumber} from ${customerEmail}. Total: ${totalLabel}.`,
    }),
  ]);
}

export async function sendOrderStatusEmails({
  orderId,
  event,
  orderNumber,
  customerName,
  customerEmail,
  total,
  currency,
  orderStatus,
  reason,
  deliveredItems = [],
}: OrderStatusEmailInput) {
  const soldInventory = event === "PAYMENT_APPROVED"
    ? await loadSoldInventory(orderId)
    : [];
  const soldInventoryHtml = createSoldInventoryHtml(soldInventory);
  const eventContent = {
    PAYMENT_APPROVED: {
      customerTitle: "Your payment has been approved",
      customerMessage:
        orderStatus === "DELIVERED"
          ? "Your payment was verified and your digital order is ready. Use the secure order page to access your delivery."
          : "Your payment was verified successfully. Your order is now being prepared for delivery.",
      adminTitle: "Payment approved",
    },
    PAYMENT_REJECTED: {
      customerTitle: "Your payment could not be approved",
      customerMessage: `Your payment proof was rejected.${reason ? ` Reason: ${reason}` : ""}`,
      adminTitle: "Payment rejected",
    },
    PRODUCT_SENT: {
      customerTitle: "Your digital product has been sent",
      customerMessage: "Your selected digital product is ready. Keep the delivery codes private.",
      adminTitle: "Product sent",
    },
    ORDER_DELIVERED: {
      customerTitle: "Your order is complete",
      customerMessage:
        "Your manual delivery is complete. Open the secure order page to review the available digital items.",
      adminTitle: "Order completed",
    },
  }[event];

  const safeOrderNumber = escapeHtml(orderNumber);
  const safeCustomerName = escapeHtml(customerName || "Customer");
  const totalLabel = formatMoney(total, currency);
  const trackingUrl = createCustomerOrderUrl(orderId, orderNumber);
  const deliveredCodesHtml = deliveredItems.length
    ? `
      <div style="margin:24px 0">
        <h2 style="font-size:20px;margin-bottom:12px">Your digital delivery</h2>
        ${deliveredItems
          .map(
            (item) => `
              <div style="border:1px solid #cbd5e1;border-radius:12px;padding:16px;margin-top:12px">
                <strong>${escapeHtml(item.productName)}</strong>
                ${item.optionName ? `<div style="margin-top:4px;color:#64748b;font-size:13px">${escapeHtml(item.optionName)}</div>` : ""}
                ${item.codes
                  .map(
                    (code) => `<div style="margin-top:10px;background:#0f172a;color:#f8fafc;border-radius:8px;padding:12px;font-family:monospace;font-size:15px;line-height:23px;white-space:pre-wrap;word-break:break-all">${escapeHtml(code)}</div>`,
                  )
                  .join("")}
              </div>
            `,
          )
          .join("")}
        <p style="color:#64748b;font-size:13px;line-height:1.6">Keep these codes private. InGamePin support will never ask you to share them.</p>
      </div>
    `
    : "";
  const receiptStatus = event === "PAYMENT_REJECTED"
    ? { label: "Payment not approved", tone: "error" as const }
    : getReceiptStatus(orderStatus);
  const customerHtml = createReceiptHtml({
    title: eventContent.customerTitle,
    intro: `Hello ${customerName || "Customer"}, ${eventContent.customerMessage}`,
    orderNumber,
    status: receiptStatus,
    contentHtml: deliveredCodesHtml + createReceiptTotalHtml(
      event === "PAYMENT_REJECTED" ? "Order total" : receiptTotalLabel(orderStatus),
      totalLabel,
      currency,
    ),
    actionUrl: trackingUrl,
  });
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <h1>${escapeHtml(eventContent.adminTitle)}</h1>
      <p><strong>Order:</strong> ${safeOrderNumber}</p>
      <p><strong>Customer:</strong> ${safeCustomerName} (${escapeHtml(customerEmail)})</p>
      <p><strong>Total:</strong> ${escapeHtml(totalLabel)}</p>
      <p><strong>Order status:</strong> ${escapeHtml(formatOrderStatus(orderStatus))}</p>
      ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
      ${soldInventoryHtml}
      <a href="https://ingamepin.com/admin/orders" style="display:inline-block;margin-top:16px;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Open admin orders</a>
    </div>
  `;

  return Promise.allSettled([
    sendOrderEmail({
      to: customerEmail,
      subject: `${eventContent.customerTitle} - ${orderNumber}`,
      html: customerHtml,
      text: `${eventContent.customerTitle}. Order ${orderNumber}. Status: ${orderStatus}. Track it at ${trackingUrl}`,
    }),
    sendOrderEmail({
      to: ORDER_NOTIFICATION_EMAIL,
      subject: `${eventContent.adminTitle} - ${orderNumber}`,
      html: adminHtml,
      text: `${eventContent.adminTitle} for order ${orderNumber}, customer ${customerEmail}, status ${orderStatus}.`,
    }),
  ]);
}

export async function sendWalletDebitEmails({
  orderNumber,
  customerName,
  customerEmail,
  amount,
  currency,
  balanceAfter,
}: WalletDebitEmailInput) {
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeCustomerName = escapeHtml(customerName || "Customer");
  const safeCustomerEmail = escapeHtml(customerEmail);
  const amountLabel = formatMoney(amount, currency);
  const balanceLabel = formatMoney(balanceAfter, currency);

  const customerHtml = createReceiptHtml({
    title: "Wallet payment successful",
    intro: `Hello ${customerName || "Customer"}, your InGamePin Wallet payment was completed successfully.`,
    orderNumber,
    status: { label: "Payment confirmed", tone: "success" },
    paymentMethod: "InGamePin Wallet",
    contentHtml: createReceiptTotalHtml("Amount deducted", amountLabel, currency)
      + `<p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#586a7c">Remaining balance: <strong style="color:#17283b">${escapeHtml(balanceLabel)}</strong></p>`,
    actionUrl: "https://ingamepin.com/account/wallet",
    actionLabel: "View wallet",
  });

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <h1>Wallet payment received</h1>
      <p><strong>Order:</strong> ${safeOrderNumber}</p>
      <p><strong>Customer:</strong> ${safeCustomerName} (${safeCustomerEmail})</p>
      <p><strong>Amount:</strong> ${escapeHtml(amountLabel)}</p>
      <p><strong>Customer wallet balance:</strong> ${escapeHtml(balanceLabel)}</p>
      <a href="https://ingamepin.com/admin/orders" style="display:inline-block;margin-top:16px;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Open admin orders</a>
    </div>
  `;

  return Promise.allSettled([
    sendOrderEmail({
      to: customerEmail,
      subject: `InGamePin wallet payment successful - ${orderNumber}`,
      html: customerHtml,
      text: `Wallet payment successful for order ${orderNumber}. Amount deducted: ${amountLabel}. Remaining balance: ${balanceLabel}.`,
    }),
    sendOrderEmail({
      to: ORDER_NOTIFICATION_EMAIL,
      subject: `Wallet payment received - ${orderNumber}`,
      html: adminHtml,
      text: `Wallet payment received for order ${orderNumber} from ${customerEmail}. Amount: ${amountLabel}.`,
    }),
  ]);
}
