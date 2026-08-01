import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyAdminsByPush } from "@/lib/admin-push";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const check = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  return check.data ? user : null;
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const input = await request.json();
  if (input?.test === true) {
    await notifyAdminsByPush(`test:${user.id}:${Date.now()}`, {
      title: "InGamePin notifications enabled",
      body: "New order and live-chat alerts will appear on this device.",
      url: "/admin",
      tag: `push-test-${Date.now()}`,
    });
    return NextResponse.json({ ok: true });
  }
  const endpoint = String(input?.endpoint ?? "");
  const p256dh = String(input?.keys?.p256dh ?? "");
  const auth = String(input?.keys?.auth ?? "");
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  const result = await createAdminClient().from("admin_push_subscriptions").upsert({ endpoint, user_id: user.id, p256dh, auth, updated_at: new Date().toISOString() });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
