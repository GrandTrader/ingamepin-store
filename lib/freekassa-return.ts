import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

// Each checkout gets its own cookie, so concurrent payments cannot overwrite it.
export function freeKassaReturnCookie(invoiceId: string) {
  return "igp_fk_return_" + createHash("sha256").update(invoiceId).digest("hex").slice(0, 24);
}

export function freeKassaCheckoutRedirect(url: string, invoiceId: string, token: string) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(freeKassaReturnCookie(invoiceId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/freekassa/success",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
