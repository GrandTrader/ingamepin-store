import { NextRequest, NextResponse } from "next/server";

function redirectToPayment(request: NextRequest) {
  return NextResponse.redirect(
    new URL(
      "/checkout/payment?error=FreeKassa+payment+was+not+completed",
      request.url,
    ),
    303,
  );
}

export async function GET(request: NextRequest) {
  return redirectToPayment(request);
}

export async function POST(request: NextRequest) {
  return redirectToPayment(request);
}