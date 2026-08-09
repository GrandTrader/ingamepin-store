import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cleanSupportText } from "@/lib/support-chat";
import { notifySupportCustomer } from "@/lib/support-customer-notification";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const check = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return check.data ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const selectedId = request.nextUrl.searchParams.get("conversationId");
    const admin = createAdminClient();
    const conversationsResult = await admin
      .from("support_conversations")
      .select(
        "id, customer_name, customer_email, status, last_message_at, admin_last_read_at, created_at",
      )
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (conversationsResult.error) {
      throw new Error(conversationsResult.error.message);
    }

    const selected =
      selectedId || conversationsResult.data?.[0]?.id || null;
    let messages: unknown[] = [];

    if (selected) {
      const messagesResult = await admin
        .from("support_messages")
        .select("id, sender_type, body, created_at")
        .eq("conversation_id", selected)
        .order("created_at", { ascending: true })
        .limit(500);

      if (messagesResult.error) {
        throw new Error(messagesResult.error.message);
      }

      messages = messagesResult.data ?? [];
      await admin
        .from("support_conversations")
        .update({ admin_last_read_at: new Date().toISOString() })
        .eq("id", selected);
    }

    return NextResponse.json({
      conversations: conversationsResult.data ?? [],
      selectedId: selected,
      messages,
    });
  } catch (error) {
    console.error("Admin support inbox load failed:", error);
    return NextResponse.json(
      { error: "Unable to load live chat." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const input = await request.json();
    const conversationId = cleanSupportText(input.conversationId, 100);
    const action = cleanSupportText(input.action, 20);
    const admin = createAdminClient();

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation is required." },
        { status: 400 },
      );
    }

    const conversationResult = await admin
      .from("support_conversations")
      .select(
        "id, customer_id, customer_name, customer_email, customer_last_read_at",
      )
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationResult.error) {
      throw new Error(conversationResult.error.message);
    }

    if (!conversationResult.data) {
      return NextResponse.json(
        { error: "Conversation was not found." },
        { status: 404 },
      );
    }

    const conversation = conversationResult.data;

    if (action === "close" || action === "open") {
      const status = action === "close" ? "CLOSED" : "OPEN";
      const result = await admin
        .from("support_conversations")
        .update({
          status,
          admin_last_read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      if (result.error) throw new Error(result.error.message);

      if (action === "close") {
        await notifySupportCustomer({
          customerId: conversation.customer_id,
          customerName: conversation.customer_name,
          customerEmail: conversation.customer_email,
          event: "CHAT_CLOSED",
        });
      }

      return NextResponse.json({ success: true, status });
    }

    const body = cleanSupportText(input.message);
    if (!body) {
      return NextResponse.json(
        { error: "Please enter a reply." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const lastReadAt = conversation.customer_last_read_at
      ? new Date(conversation.customer_last_read_at).getTime()
      : 0;
    const customerIsAway = Date.now() - lastReadAt > 15_000;
    const result = await admin.from("support_messages").insert({
      conversation_id: conversationId,
      sender_type: "ADMIN",
      sender_user_id: user.id,
      body,
    });

    if (result.error) throw new Error(result.error.message);

    await admin
      .from("support_conversations")
      .update({
        status: "OPEN",
        last_message_at: now,
        admin_last_read_at: now,
        updated_at: now,
      })
      .eq("id", conversationId);

    if (customerIsAway) {
      await notifySupportCustomer({
        customerId: conversation.customer_id,
        customerName: conversation.customer_name,
        customerEmail: conversation.customer_email,
        event: "ADMIN_REPLY",
        message: body,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin support reply failed:", error);
    return NextResponse.json(
      { error: "Unable to update live chat." },
      { status: 500 },
    );
  }
}
