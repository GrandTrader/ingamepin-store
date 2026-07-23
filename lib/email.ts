import "server-only";

import nodemailer from "nodemailer";

type SendEmailInput = {
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
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  total: number;
  currency: string;
  paymentMethod: string;
  status: string;
  items: OrderEmailItem[];
};

type OrderStatusEmailInput = {
  event: "PAYMENT_APPROVED" | "PAYMENT_REJECTED" | "ORDER_DELIVERED";
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

function createTransporter() {
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
    auth: {
      user: getRequiredEnvironmentVariable("SMTP_USER"),
      pass: getRequiredEnvironmentVariable("SMTP_PASSWORD"),
    },
  });
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo = "support@ingamepin.com",
}: SendEmailInput) {
  const recipient = to.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("The recipient email address is invalid.");
  }

  const transporter = createTransporter();

  return transporter.sendMail({
    from: getRequiredEnvironmentVariable("SMTP_FROM"),
    to: recipient,
    replyTo,
    subject,
    html,
    text,
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

export async function sendOrderCreatedEmails({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  total,
  currency,
  paymentMethod,
  status,
  items,
}: OrderCreatedEmailInput) {
  const safeOrderNumber = escapeHtml(orderNumber);
  const safeCustomerName = escapeHtml(customerName || "Customer");
  const itemRows = createOrderItemsHtml(items);
  const totalLabel = formatMoney(total, currency);
  const trackingUrl = "https://ingamepin.com/track-order";

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <div style="background:#06b6d4;border-radius:14px;padding:18px 22px;font-size:24px;font-weight:800">InGamePin</div>
      <h1 style="font-size:26px;margin:28px 0 10px">We received your order</h1>
      <p style="color:#475569;line-height:1.7">Hello ${safeCustomerName}, your order has been created successfully.</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:22px 0">
        <div style="color:#64748b;font-size:13px">Order number</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">${safeOrderNumber}</div>
      </div>
      <table style="width:100%;border-collapse:collapse"><tbody>${itemRows}</tbody></table>
      <div style="display:flex;justify-content:space-between;margin-top:22px;padding-top:18px;border-top:2px solid #0f172a;font-size:18px">
        <strong>Total</strong><strong>${escapeHtml(totalLabel)}</strong>
      </div>
      <p style="margin-top:22px;color:#475569;line-height:1.7">Payment method: <strong>${escapeHtml(paymentMethod.replaceAll("_", " "))}</strong><br>Status: <strong>${escapeHtml(formatOrderStatus(status))}</strong></p>
      <a href="${trackingUrl}" style="display:inline-block;margin-top:12px;background:#06b6d4;color:#082f49;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Track your order</a>
      <p style="margin-top:28px;color:#64748b;font-size:13px;line-height:1.6">Need help? Reply to this email or contact support@ingamepin.com.</p>
    </div>
  `;

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <h1>New InGamePin order</h1>
      <p><strong>Order:</strong> ${safeOrderNumber}</p>
      <p><strong>Customer:</strong> ${safeCustomerName}</p>
      <p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(customerPhone || "Not provided")}</p>
      <p><strong>Total:</strong> ${escapeHtml(totalLabel)}</p>
      <p><strong>Payment:</strong> ${escapeHtml(paymentMethod.replaceAll("_", " "))}</p>
      <table style="width:100%;border-collapse:collapse"><tbody>${itemRows}</tbody></table>
      <a href="https://ingamepin.com/admin/orders" style="display:inline-block;margin-top:20px;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Open admin orders</a>
    </div>
  `;

  return Promise.allSettled([
    sendEmail({
      to: customerEmail,
      subject: `InGamePin order received — ${orderNumber}`,
      html: customerHtml,
      text: `Your InGamePin order ${orderNumber} has been created. Total: ${totalLabel}. Track it at ${trackingUrl}`,
    }),
    sendEmail({
      to: "support@ingamepin.com",
      subject: `New order ${orderNumber} — ${totalLabel}`,
      html: adminHtml,
      text: `New order ${orderNumber} from ${customerName} (${customerEmail}). Total: ${totalLabel}.`,
    }),
  ]);
}

export async function sendOrderStatusEmails({
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
  const trackingUrl = "https://ingamepin.com/track-order";
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
                    (code) => `<div style="margin-top:10px;background:#0f172a;color:#f8fafc;border-radius:8px;padding:12px;font-family:monospace;font-size:15px;word-break:break-all">${escapeHtml(code)}</div>`,
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
  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <div style="background:#06b6d4;border-radius:14px;padding:18px 22px;font-size:24px;font-weight:800">InGamePin</div>
      <h1 style="font-size:26px;margin:28px 0 10px">${escapeHtml(eventContent.customerTitle)}</h1>
      <p style="color:#475569;line-height:1.7">Hello ${safeCustomerName}, ${escapeHtml(eventContent.customerMessage)}</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:22px 0">
        <div style="color:#64748b;font-size:13px">Order number</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">${safeOrderNumber}</div>
        <div style="margin-top:10px;color:#475569">Total: <strong>${escapeHtml(totalLabel)}</strong></div>
        <div style="margin-top:5px;color:#475569">Status: <strong>${escapeHtml(formatOrderStatus(orderStatus))}</strong></div>
      </div>
      ${deliveredCodesHtml}
      <a href="${trackingUrl}" style="display:inline-block;background:#06b6d4;color:#082f49;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Track your order</a>
      <p style="margin-top:28px;color:#64748b;font-size:13px;line-height:1.6">Need help? Reply to this email or contact support@ingamepin.com.</p>
    </div>
  `;
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <h1>${escapeHtml(eventContent.adminTitle)}</h1>
      <p><strong>Order:</strong> ${safeOrderNumber}</p>
      <p><strong>Customer:</strong> ${safeCustomerName} (${escapeHtml(customerEmail)})</p>
      <p><strong>Total:</strong> ${escapeHtml(totalLabel)}</p>
      <p><strong>Order status:</strong> ${escapeHtml(formatOrderStatus(orderStatus))}</p>
      ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
      <a href="https://ingamepin.com/admin/orders" style="display:inline-block;margin-top:16px;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Open admin orders</a>
    </div>
  `;

  return Promise.allSettled([
    sendEmail({
      to: customerEmail,
      subject: `${eventContent.customerTitle} - ${orderNumber}`,
      html: customerHtml,
      text: `${eventContent.customerTitle}. Order ${orderNumber}. Status: ${orderStatus}. Track it at ${trackingUrl}`,
    }),
    sendEmail({
      to: "support@ingamepin.com",
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

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
      <div style="background:#06b6d4;border-radius:14px;padding:18px 22px;font-size:24px;font-weight:800">InGamePin</div>
      <h1 style="font-size:26px;margin:28px 0 10px">Wallet payment successful</h1>
      <p style="color:#475569;line-height:1.7">Hello ${safeCustomerName}, your InGamePin Wallet payment was completed successfully.</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:22px 0">
        <div style="color:#64748b;font-size:13px">Order number</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">${safeOrderNumber}</div>
        <div style="margin-top:12px;color:#475569">Amount deducted: <strong>${escapeHtml(amountLabel)}</strong></div>
        <div style="margin-top:6px;color:#475569">Remaining balance: <strong>${escapeHtml(balanceLabel)}</strong></div>
      </div>
      <a href="https://ingamepin.com/account/wallet" style="display:inline-block;background:#06b6d4;color:#082f49;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">View wallet</a>
    </div>
  `;

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
    sendEmail({
      to: customerEmail,
      subject: `InGamePin wallet payment successful - ${orderNumber}`,
      html: customerHtml,
      text: `Wallet payment successful for order ${orderNumber}. Amount deducted: ${amountLabel}. Remaining balance: ${balanceLabel}.`,
    }),
    sendEmail({
      to: "support@ingamepin.com",
      subject: `Wallet payment received - ${orderNumber}`,
      html: adminHtml,
      text: `Wallet payment received for order ${orderNumber} from ${customerEmail}. Amount: ${amountLabel}.`,
    }),
  ]);
}
