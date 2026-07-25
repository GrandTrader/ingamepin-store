import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSupportText,
  createSupportToken,
  hashSupportToken,
  SUPPORT_COOKIE,
} from "@/lib/support-chat";
import { notifyNewSupportMessage } from "@/lib/telegram-chat-notification";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  status: "OPEN" | "CLOSED";
  last_message_at: string;
};

async function getIdentity() {
  const cookieStore = await cookies();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const existingToken = cookieStore.get(SUPPORT_COOKIE)?.value ?? "";

  return {
    user,
    token: existingToken || createSupportToken(),
    isNewToken: !existingToken,
  };
}

function attachCookie(response: NextResponse, token: string, isNew: boolean) {
  if (isNew) {
    response.cookies.set(SUPPORT_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

async function findConversation(
  customerId: string | null,
  tokenHash: string,
) {
  const admin = createAdminClient();
  let query = admin
    .from("support_conversations")
    .select("id, customer_name, customer_email, status, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(1);

  query = customerId
    ? query.eq("customer_id", customerId)
    : query.eq("guest_token_hash", tokenHash);

  const result = await query.maybeSingle();
  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? null) as ConversationRow | null;
}

export async function GET() {
  try {
    const identity = await getIdentity();
    const tokenHash = hashSupportToken(identity.token);
    const conversation = await findConversation(
      identity.user?.id ?? null,
      tokenHash,
    );

    if (!conversation) {
      return attachCookie(
        NextResponse.json({ conversation: null, messages: [] }),
        identity.token,
        identity.isNewToken,
      );
    }

    const admin = createAdminClient();
    const messagesResult = await admin
      .from("support_messages")
      .select("id, sender_type, body, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(250);

    if (messagesResult.error) {
      throw new Error(messagesResult.error.message);
    }

    await admin
      .from("support_conversations")
      .update({ customer_last_read_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return attachCookie(
      NextResponse.json({
        conversation,
        messages: messagesResult.data ?? [],
      }),
      identity.token,
      identity.isNewToken,
    );
  } catch (error) {
    console.error("Support chat load failed:", error);
    return NextResponse.json(
      { error: "Unable to load support chat." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity();
    const input = await request.json();
    const body = cleanSupportText(input.message);
    const suppliedName = cleanSupportText(input.name, 100);
    const suppliedEmail = cleanSupportText(input.email, 320).toLowerCase();

    if (!body) {
      return NextResponse.json(
        { error: "Please enter a message." },
        { status: 400 },
      );
    }

    const tokenHash = hashSupportToken(identity.token);
    let conversation = await findConversation(
      identity.user?.id ?? null,
      tokenHash,
    );
    const admin = createAdminClient();

    if (!conversation) {
      const name =
        cleanSupportText(identity.user?.user_metadata?.full_name, 100) ||
        suppliedName ||
        "Guest";
      const email =
        identity.user?.email?.trim().toLowerCase() || suppliedEmail || null;

      if (!identity.user && (!suppliedName || !suppliedEmail)) {
        return NextResponse.json(
          { error: "Please enter your name and email." },
          { status: 400 },
        );
      }

      const createResult = await admin
        .from("support_conversations")
        .insert({
          customer_id: identity.user?.id ?? null,
          guest_token_hash: identity.user ? null : tokenHash,
          customer_name: name,
          customer_email: email,
        })
        .select("id, customer_name, customer_email, status, last_message_at")
        .single();

      if (createResult.error) {
        throw new Error(createResult.error.message);
      }

      conversation = createResult.data as ConversationRow;
    } else if (conversation.status === "CLOSED") {
      const reopenResult = await admin
        .from("support_conversations")
        .update({
          status: "OPEN",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)
        .select("id, customer_name, customer_email, status, last_message_at")
        .single();

      if (reopenResult.error) {
        throw new Error(reopenResult.error.message);
      }

      conversation = reopenResult.data as ConversationRow;
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const recentResult = await admin
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id)
      .eq("sender_type", "CUSTOMER")
      .gte("created_at", oneMinuteAgo);

    if ((recentResult.count ?? 0) >= 10) {
      return NextResponse.json(
        { error: "Please wait before sending more messages." },
        { status: 429 },
      );
    }

    const now = new Date().toISOString();
    const messageResult = await admin
      .from("support_messages")
      .insert({
        conversation_id: conversation.id,
        sender_type: "CUSTOMER",
        sender_user_id: identity.user?.id ?? null,
        body,
      })
      .select("id, sender_type, body, created_at")
      .single();

    if (messageResult.error) {
      throw new Error(messageResult.error.message);
    }

    await admin
      .from("support_conversations")
      .update({
        status: "OPEN",
        last_message_at: now,
        customer_last_read_at: now,
        updated_at: now,
      })
      .eq("id", conversation.id);

    await notifyNewSupportMessage({
      conversationId: conversation.id,
      customerName: conversation.customer_name,
      customerEmail: conversation.customer_email,
      message: body,
    });

    return attachCookie(
      NextResponse.json({
        conversation: { ...conversation, status: "OPEN", last_message_at: now },
        message: messageResult.data,
      }),
      identity.token,
      identity.isNewToken,
    );
  } catch (error) {
    console.error("Support message send failed:", error);
    return NextResponse.json(
      { error: "Unable to send your message." },
      { status: 500 },
    );
  }
}
