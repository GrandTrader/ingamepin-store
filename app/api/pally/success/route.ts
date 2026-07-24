import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getPallyApiToken } from "@/lib/pally";

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

  return NextResponse.redirect(
    new URL(valid ? "/checkout/success" : "/checkout/payment", request.url),
    303,
  );
}
