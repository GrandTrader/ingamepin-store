import "server-only";

import { notifyAdminsByPush } from "@/lib/admin-push";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

type OrderItemRow = {
  product_id: string;
  product_option_id: string | null;
};

type ProductOptionRow = {
  id: string;
  product_id: string;
  option_name: string;
  denomination: number | null;
  stock_quantity: number;
};

type ProductRow = {
  id: string;
  name: string;
  delivery_type: "AUTOMATIC" | "MANUAL";
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendTelegramAlert(message: string, adminUrl: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) return;

  const response = await fetch(
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
          inline_keyboard: [[{ text: "Add voucher codes", url: adminUrl }]],
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram API returned ${response.status}.`);
  }
}

export async function notifySoldOutInstantOptions(orderId: string) {
  try {
    const admin = createAdminClient();
    const itemResult = await admin
      .from("order_items")
      .select("product_id, product_option_id")
      .eq("order_id", orderId);

    if (itemResult.error) throw itemResult.error;

    const items = (itemResult.data ?? []) as OrderItemRow[];
    const optionIds = Array.from(
      new Set(
        items
          .map((item) => item.product_option_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (optionIds.length === 0) return;

    const optionResult = await admin
      .from("product_options")
      .select("id, product_id, option_name, denomination, stock_quantity")
      .in("id", optionIds)
      .lte("stock_quantity", 0);

    if (optionResult.error) throw optionResult.error;

    const options = (optionResult.data ?? []) as ProductOptionRow[];
    if (options.length === 0) return;

    const productIds = Array.from(
      new Set(options.map((option) => option.product_id)),
    );
    const productResult = await admin
      .from("products")
      .select("id, name, delivery_type")
      .in("id", productIds)
      .eq("delivery_type", "AUTOMATIC");

    if (productResult.error) throw productResult.error;

    const products = (productResult.data ?? []) as ProductRow[];
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ingamepin.com"
    ).replace(/\/+$/, "");

    for (const option of options) {
      const product = productsById.get(option.product_id);
      if (!product) continue;

      const eventKey = `sold-out:${orderId}:${option.id}`;
      const claimResult = await admin
        .from("admin_push_events")
        .insert({ event_key: eventKey });

      if (claimResult.error) {
        if (claimResult.error.code !== "23505") {
          console.error("Sold-out notification claim failed:", claimResult.error);
        }
        continue;
      }

      const optionLabel =
        option.option_name ||
        (option.denomination === null
          ? "Product option"
          : String(option.denomination));
      const adminUrl = `${siteUrl}/admin/products/${encodeURIComponent(option.product_id)}/edit/stock`;
      const subject = `Sold out: ${product.name} - ${optionLabel}`;
      const body = `${product.name} (${optionLabel}) has 0 instant-delivery codes remaining.`;
      const telegramMessage = [
        "&#9888;&#65039; <b>Instant product sold out</b>",
        "",
        `<b>Product:</b> ${escapeHtml(product.name)}`,
        `<b>Denomination:</b> ${escapeHtml(optionLabel)}`,
        "<b>Available quantity:</b> 0",
        "",
        "Add new voucher codes before accepting more orders.",
      ].join("\n");

      const results = await Promise.allSettled([
        notifyAdminsByPush(`sold-out-push:${orderId}:${option.id}`, {
          title: "Instant product sold out",
          body,
          url: `/admin/products/${option.product_id}/edit/stock`,
          tag: `sold-out-${option.id}`,
        }),
        sendEmail({
          to:
            process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
            "support@ingamepin.com",
          subject,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#0f172a"><h1 style="font-size:24px">Instant product sold out</h1><p><strong>Product:</strong> ${escapeHtml(product.name)}</p><p><strong>Denomination:</strong> ${escapeHtml(optionLabel)}</p><p><strong>Available quantity:</strong> 0</p><a href="${adminUrl}" style="display:inline-block;margin-top:16px;background:#0f172a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Add voucher codes</a></div>`,
          text: `${body} Add voucher codes: ${adminUrl}`,
        }),
        sendTelegramAlert(telegramMessage, adminUrl),
      ]);

      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Sold-out admin notification failed:", result.reason);
        }
      });
    }
  } catch (error) {
    console.error("Instant stock notification check failed:", error);
  }
}
