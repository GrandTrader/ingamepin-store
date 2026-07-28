import { NextRequest, NextResponse } from "next/server";

function redirectToSuccess(request: NextRequest) {
  return NextResponse.redirect(new URL("/checkout/success", request.url), 303);
}

export async function GET(request: NextRequest) {
  return redirectToSuccess(request);
}

export async function POST(request: NextRequest) {
  return redirectToSuccess(request);
}