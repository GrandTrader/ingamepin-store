import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  return NextResponse.redirect(
    new URL("/checkout/payment?error=Pally+payment+was+not+completed", request.url),
    303,
  );
}
