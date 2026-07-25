import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(
    new URL(
      "/checkout/payment?error=FreeKassa+payment+was+not+completed",
      request.url,
    ),
    303,
  );
}