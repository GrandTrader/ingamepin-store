import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { ownsPurchase, purchaseIdentity } from "@/lib/purchase-access";
import { privateJson, requestLimit, sameOrigin } from "@/lib/request-security";

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
  if (!sameOrigin(request)) return privateJson({ error: "Invalid request origin." }, 403);
  try {
    const blocked = await requestLimit(request, "purchase-review", 15, 60);
    if (blocked) return blocked;
    const body = (await request.json()) as ReviewRequest;
    const orderId = String(body.orderId ?? "").trim();
    const orderNumber = String(body.orderNumber ?? "").trim().toUpperCase();
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

    const identity = await purchaseIdentity();
    const ownerEmail = order.customer_email.trim().toLowerCase();
    const verifiedOwner = ownsPurchase(identity, order);
    const tokenOwner = Boolean(accessToken.length >= 40 && accessToken.length <= 128 && order.access_token_hash && tokenMatches(accessToken, order.access_token_hash));

    if (!verifiedOwner && !tokenOwner) return privateJson({ error: "Verify your email before reviewing this purchase." }, 403);

    const reviewResult = await admin.rpc("submit_verified_order_review", {
      p_order_id: order.id,
      p_customer_id:
        verifiedOwner && identity?.userId && identity.userId === order.customer_id ? identity.userId : null,
      p_customer_email: ownerEmail,
      p_sentiment: sentiment,
      p_comment: comment || null,
    });
    if (reviewResult.error?.code === "23505") return NextResponse.json({ error: "A review has already been submitted for this order." }, { status: 409 });
    if (reviewResult.error) throw reviewResult.error;

    const result = reviewResult.data as {
      rewardAmount?: number;
      supportCaseId?: string | null;
    } | null;

    return NextResponse.json({
      success: true,
      rewardAmount: Number(result?.rewardAmount ?? 0),
      supportCaseCreated: Boolean(result?.supportCaseId),
    });
  } catch (error) {
    console.error("Order review submission failed:", error);
    return NextResponse.json({ error: "Unable to submit your review right now." }, { status: 500 });
  }
}
