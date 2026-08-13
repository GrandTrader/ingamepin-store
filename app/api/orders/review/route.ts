import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ReviewRequest = {
  orderId?: unknown;
  orderNumber?: unknown;
  email?: unknown;
  accessToken?: unknown;
  sentiment?: unknown;
  comment?: unknown;
};

function tokenMatches(token: string, storedHash: string) {
  const supplied = createHash("sha256").update(token).digest();
  const expected = Buffer.from(storedHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReviewRequest;
    const orderId = String(body.orderId ?? "").trim();
    const orderNumber = String(body.orderNumber ?? "").trim().toUpperCase();
    const email = String(body.email ?? "").trim().toLowerCase();
    const accessToken = String(body.accessToken ?? "").trim();
    const sentiment = String(body.sentiment ?? "").trim().toUpperCase();
    const comment = String(body.comment ?? "").trim();

    if (!orderId && orderNumber.length < 8) return NextResponse.json({ error: "Order information is invalid." }, { status: 400 });
    if (sentiment !== "POSITIVE" && sentiment !== "NEGATIVE") return NextResponse.json({ error: "Select a positive or negative rating." }, { status: 400 });
    if (comment.length > 1000) return NextResponse.json({ error: "Review comments cannot exceed 1,000 characters." }, { status: 400 });

    const admin = createAdminClient();
    let query = admin.from("orders").select("id, customer_id, customer_email, status, access_token_hash");
    query = orderId ? query.eq("id", orderId) : query.eq("order_number", orderNumber);
    const orderResult = await query.maybeSingle();
    const order = orderResult.data;

    if (orderResult.error || !order || order.status !== "DELIVERED") return NextResponse.json({ error: "Only completed purchases can be reviewed." }, { status: 403 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const ownerEmail = order.customer_email.trim().toLowerCase();
    const signedInOwner = Boolean(user && (user.id === order.customer_id || user.email?.trim().toLowerCase() === ownerEmail));
    const guestOwner = email.length >= 5 && email === ownerEmail;
    const tokenOwner = Boolean(accessToken.length >= 40 && order.access_token_hash && tokenMatches(accessToken, order.access_token_hash));

    if (!signedInOwner && !guestOwner && !tokenOwner) return NextResponse.json({ error: "Order verification failed." }, { status: 403 });

    const insertResult = await admin.from("order_reviews").insert({
      order_id: order.id,
      customer_id: order.customer_id,
      customer_email: ownerEmail,
      sentiment,
      comment: comment || null,
    });
    if (insertResult.error?.code === "23505") return NextResponse.json({ error: "A review has already been submitted for this order." }, { status: 409 });
    if (insertResult.error) throw insertResult.error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Order review submission failed:", error);
    return NextResponse.json({ error: "Unable to submit your review right now." }, { status: 500 });
  }
}

