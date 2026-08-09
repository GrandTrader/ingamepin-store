import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

type SupportCustomerNotificationInput = {
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  event: "ADMIN_REPLY" | "CHAT_CLOSED";
  message?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function notifySupportCustomer({
  customerId,
  customerName,
  customerEmail,
  event,
  message = "",
}: SupportCustomerNotificationInput) {
  const isReply = event === "ADMIN_REPLY";
  const title = isReply ? "New support reply" : "Support chat closed";
  const accountMessage = isReply
    ? "Our support team replied to your live-chat message."
    : "Your live-chat conversation was closed by our support team.";
  const safePreview = escapeHtml(message.slice(0, 500));
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ingamepin.com"
  ).replace(/\/+$/, "");

  const tasks: Promise<unknown>[] = [];

  if (customerId) {
    tasks.push(
      (async () => {
        const result = await createAdminClient()
          .from("customer_notifications")
          .insert({
            user_id: customerId,
            notification_type: "SUPPORT",
            title,
            message: accountMessage,
          });

        if (result.error) throw result.error;
      })(),
    );
  }

  if (customerEmail) {
    tasks.push(
      sendEmail({
        to: customerEmail,
        subject: `${title} - InGamePin`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a">
            <h1 style="font-size:24px;margin:0 0 16px">${title}</h1>
            <p>Hello ${escapeHtml(customerName || "Customer")},</p>
            <p>${accountMessage}</p>
            ${
              isReply && safePreview
                ? `<div style="margin:20px 0;padding:16px;border-left:4px solid #06b6d4;background:#f1f5f9;white-space:pre-wrap">${safePreview}</div>`
                : ""
            }
            <p>Visit InGamePin and open Live Chat to continue the conversation.</p>
            <a href="${siteUrl}" style="display:inline-block;margin-top:8px;padding:12px 18px;border-radius:10px;background:#06b6d4;color:#0f172a;text-decoration:none;font-weight:700">Open InGamePin</a>
          </div>
        `,
        text: isReply
          ? `${title}. ${accountMessage} Reply: ${message.slice(0, 500)} Visit ${siteUrl} and open Live Chat.`
          : `${title}. ${accountMessage} Visit ${siteUrl} if you need more help.`,
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Customer support notification failed:", result.reason);
    }
  });
}
