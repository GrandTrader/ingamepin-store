import "server-only";
import { notifyAdminsByPush } from "@/lib/admin-push";
import { sendEmail, SUPPORT_EMAIL } from "@/lib/email";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function notifyNewSupportMessage(input: {
  messageId: string;
  conversationId: string;
  customerName: string;
  customerEmail: string | null;
  message: string;
}) {
  const replyTo = input.customerEmail?.trim().toLowerCase();
  const canReply = replyTo && replyTo.length <= 254 && /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(replyTo);
  const message = input.message.slice(0, 4000);
  const alerts = await Promise.allSettled([
    notifyAdminsByPush(`chat:${input.messageId}`, {
      title: "New live-chat message",
      body: `${input.customerName}: ${input.message.slice(0, 140)}`,
      url: "/admin/live-chat",
      tag: `chat-${input.conversationId}`,
    }),
    sendEmail({
      to: SUPPORT_EMAIL,
      replyTo: canReply ? replyTo : SUPPORT_EMAIL,
      subject: "New InGamePin support enquiry",
      text: `Customer: ${input.customerName}\nEmail supplied: ${input.customerEmail || "Not provided"}\nConversation: ${input.conversationId}\n\n${message}\n\nOpen live chat: https://www.ingamepin.com/admin/live-chat`,
      html: `<div style="font-family:Arial,sans-serif"><h1>New support enquiry</h1><p><strong>Customer:</strong> ${escapeHtml(input.customerName)}</p><p><strong>Email supplied:</strong> ${escapeHtml(input.customerEmail || "Not provided")}</p><p><strong>Conversation:</strong> ${escapeHtml(input.conversationId)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p><a href="https://www.ingamepin.com/admin/live-chat">Open live chat</a></div>`,
    }).then(result => { if (result.rejected?.length) throw new Error("Support email rejected."); }),
  ]);
  // Saved chat messages still succeed if an alert provider is unavailable.
  for (const alert of alerts) if (alert.status === "rejected") console.error("Support admin notification failed.");
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    console.warn(
      "Telegram chat notification skipped: bot token or chat ID is missing.",
    );
    return;
  }

  try {
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ingamepin.com"
    ).replace(/\/+$/, "");
    const adminUrl = `${siteUrl}/admin/live-chat`;
    const preview =
      input.message.length > 500
        ? `${input.message.slice(0, 500)}...`
        : input.message;
    const text = [
      "<b>New live-chat message</b>",
      "",
      `<b>Customer:</b> ${escapeHtml(input.customerName)}`,
      `<b>Email:</b> ${escapeHtml(input.customerEmail || "Not provided")}`,
      "",
      `<b>Message:</b> ${escapeHtml(preview)}`,
    ].join("\n");

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "Open Live Chat", url: adminUrl }],
            ],
          },
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Telegram API returned ${response.status}.`);
    }
  } catch (error) {
    console.error("Telegram live-chat notification failed:", error);
  }
}
