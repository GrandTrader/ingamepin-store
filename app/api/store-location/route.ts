import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function countryFromRequest(request: NextRequest) {
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code") ??
    ""
  )
    .trim()
    .toUpperCase();
}

export function GET(request: NextRequest) {
  const country = countryFromRequest(request);

  const preferences =
    country === "IN"
      ? { language: "en", currency: "INR" }
      : country === "RU"
        ? { language: "ru", currency: "RUB" }
        : { language: "en", currency: "USD" };

  return NextResponse.json(
    { country, ...preferences },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
