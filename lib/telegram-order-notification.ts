import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoney(amount: unknown, currency: unknown) {
  const numericAmount = Number(amount);
  const safeAmount = Number.isFinite(numericAmount)
    ? numericAmount.toFixed(2)
    : String(amount ?? "0");

  return `${safeAmount} ${String(currency ?? "USD").toUpperCase()}`;
}

export async function notifyPaidOrderInTelegram(orderId: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    console.warn(
      "Telegram order notification skipped: bot token or chat ID is missing.",
    );
    return;
  }

  const admin = createAdminClient();
  const claimedAt = new Date().toISOString();
  const claimResult = await admin
    .from("orders")
    .update({ telegram_notified_at: claimedAt })
    .eq("id", orderId)
    .is("telegram_notified_at", null)
    .select("id")
    .maybeSingle();

  if (claimResult.error) {
    console.error("Telegram notification claim failed:", claimResult.error);
    return;
  }

  if (!claimResult.data) {
    return;
  }

  try {
    const [orderResult, itemResult, paymentResult] = await Promise.all([
      admin
        .from("orders")
        .select(
          "order_number, customer_name, customer_email, total, currency, status",
        )
        .eq("id", orderId)
        .single(),
      admin
        .from("order_items")
        .select("product_name, option_name, quantity")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      admin
        .from("payments")
        .select("method")
        .eq("order_id", orderId)
        .maybeSingle(),
    ]);

    if (orderResult.error) throw orderResult.error;
    if (itemResult.error) throw itemResult.error;
    if (paymentResult.error) throw paymentResult.error;

    const order = orderResult.data;
    const itemLines = (itemResult.data ?? []).map((item) => {
      const option = item.option_name
        ? ` — ${escapeHtml(item.option_name)}`
        : "";

      return `• ${escapeHtml(item.product_name)}${option} × ${escapeHtml(item.quantity)}`;
    });
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ingamepin.com"
    ).replace(/\/+$/, "");
    const adminUrl = `${siteUrl}/admin/orders?order=${encodeURIComponent(orderId)}#order-${encodeURIComponent(orderId)}`;
    const message = [
      "✅ <b>Payment verified</b>",
      "",
      `<b>Order:</b> ${escapeHtml(order.order_number)}`,
      `<b>Customer:</b> ${escapeHtml(order.customer_name || "Customer")}`,
      `<b>Email:</b> ${escapeHtml(order.customer_email)}`,
      `<b>Payment:</b> ${escapeHtml(paymentResult.data?.method ?? "Unknown")}`,
      `<b>Total:</b> ${escapeHtml(formatMoney(order.total, order.currency))}`,
      `<b>Status:</b> ${escapeHtml(order.status)}`,
      "",
      "<b>Items</b>",
      ...(itemLines.length ? itemLines : ["• No item information found"]),
    ].join("\n");

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "Open Order in Admin", url: adminUrl }],
            ],
          },
        }),
        cache: "no-store",
      },
    );

    if (!telegramResponse.ok) {
      throw new Error(
        `Telegram API rejected the notification (${telegramResponse.status}).`,
      );
    }
  } catch (error) {
    await admin
      .from("orders")
      .update({ telegram_notified_at: null })
      .eq("id", orderId)
      .eq("telegram_notified_at", claimedAt);

    console.error("Telegram order notification failed:", error);
  }
}
