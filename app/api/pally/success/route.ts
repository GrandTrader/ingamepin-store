import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getPallyApiToken } from "@/lib/pally";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const amount = String(form.get("OutSum") ?? "").trim();
  const orderId = String(form.get("InvId") ?? "").trim();
  const signature = String(form.get("SignatureValue") ?? "").trim().toUpperCase();
  const expected = createHash("md5")
    .update(`${amount}:${orderId}:${getPallyApiToken()}`)
    .digest("hex")
    .toUpperCase();
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const valid =
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);

  if (!valid) {
    return NextResponse.redirect(new URL("/checkout/payment", request.url), 303);
  }

  const topup = orderId
    ? await createAdminClient()
        .from("wallet_topup_requests")
        .select("id")
        .eq("id", orderId)
        .eq("payment_method", "PALLY")
        .maybeSingle()
    : null;

  return NextResponse.redirect(
    new URL(
      topup?.data
        ? `/account/wallet/topup-return?requestId=${encodeURIComponent(orderId)}`
        : "/checkout/success",
      request.url,
    ),
    303,
  );
}
