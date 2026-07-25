import "server-only";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function notifyNewSupportMessage(input: {
  conversationId: string;
  customerName: string;
  customerEmail: string | null;
  message: string;
}) {
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

