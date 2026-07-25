import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number;
      type?: string;
    };
    text?: string;
  };
};

function secureValueMatches(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const receivedSecret =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? "";

  if (
    !botToken ||
    !webhookSecret ||
    !secureValueMatches(receivedSecret, webhookSecret)
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const chatType = update.message?.chat?.type;
    const text = update.message?.text?.trim().toLowerCase() ?? "";

    if (!chatId || chatType !== "private") {
      return NextResponse.json({ received: true });
    }

    if (!text.startsWith("/start") && text !== "/menu") {
      return NextResponse.json({ received: true });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Welcome to iNgamePIN STORE 🎮\nChoose an option below:",
          reply_markup: {
            keyboard: [
              [
                {
                  text: "🛍 Open Store",
                  web_app: { url: "https://www.ingamepin.com/" },
                },
                {
                  text: "📦 Track Order",
                  web_app: { url: "https://www.ingamepin.com/track-order" },
                },
              ],
              [
                {
                  text: "👤 My Account",
                  web_app: { url: "https://www.ingamepin.com/account" },
                },
                {
                  text: "💬 Support",
                  web_app: { url: "https://www.ingamepin.com/support" },
                },
              ],
            ],
            resize_keyboard: true,
            is_persistent: true,
            input_field_placeholder: "Choose an option",
          },
        }),
        cache: "no-store",
      },
    );

    if (!telegramResponse.ok) {
      const errorBody = await telegramResponse.text();
      console.error(
        "Telegram store menu response failed:",
        telegramResponse.status,
        errorBody,
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Telegram store menu webhook failed:", error);
    return NextResponse.json({ received: true });
  }
}
