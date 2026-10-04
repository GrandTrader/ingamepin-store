import { randomBytes, randomInt } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { GUEST_CHALLENGE_COOKIE, GUEST_PURCHASE_COOKIE, purchaseCookieOptions, purchaseIdentity, tokenHash, validPurchaseToken } from "@/lib/purchase-access";
import { consumeRate, privateJson, requestLimit, sameOrigin, securityHash } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { const identity = await purchaseIdentity(); return privateJson({ verified: Boolean(identity), email: identity?.email ?? null, source: identity?.source ?? null }); }
  catch { return privateJson({ error: "Unable to verify purchase access." }, 503); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return privateJson({ error: "Invalid request origin." }, 403);
  try {
    const blocked = await requestLimit(request, "purchase-verification", 20, 900);
    if (blocked) return blocked;
    const raw = await request.text();
    if (raw.length > 2048) return privateJson({ error: "Request too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return privateJson({ error: "Invalid request." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return privateJson({ error: "Invalid request." }, 400);
    const db = createAdminClient();
    if (body.action === "send") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (email.length > 254 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) return privateJson({ error: "Enter a valid email address." }, 400);
      if (!(await consumeRate("purchase-otp-resend", email, 1, 60)) || !(await consumeRate("purchase-otp-email", email, 3, 900))) return privateJson({ error: "Please wait before requesting another code." }, 429);
      const token = randomBytes(32).toString("base64url");
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      const hash = tokenHash(token);
      // Retain expired records only briefly; all access checks also enforce expiry.
      await db.from("guest_purchase_challenges").delete().lt("expires_at", new Date().toISOString());
      await db.from("guest_purchase_sessions").delete().lt("expires_at", new Date().toISOString());
      const saved = await db.from("guest_purchase_challenges").insert({ token_hash: hash, email, code_hash: securityHash(`purchase-otp:${token}:${code}`) });
      if (saved.error) throw Error("Unable to create verification.");
      try {
        await sendEmail({ to: email, subject: "Your InGamePin purchase verification code", text: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.`, html: `<p>Your InGamePin purchase verification code:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.</p>` });
      } catch {
        await db.from("guest_purchase_challenges").delete().eq("token_hash", hash);
        return privateJson({ error: "Unable to send the code. Please try again later." }, 503);
      }
      // Identical behavior whether or not any purchases exist for this address.
      const response = privateJson({ sent: true, message: "Check your email for a six-digit code.", retryAfter: 60 });
      response.cookies.set(GUEST_CHALLENGE_COOKIE, token, { ...purchaseCookieOptions, maxAge: 600 });
      return response;
    }
    if (body.action === "verify") {
      const challenge = request.cookies.get(GUEST_CHALLENGE_COOKIE)?.value ?? "";
      const code = String(body.code ?? "").trim();
      if (!validPurchaseToken(challenge) || !/^\d{6}$/.test(code)) return privateJson({ error: "Invalid or expired code. Request a new code if needed." }, 400);
      const session = randomBytes(32).toString("base64url");
      const result = await db.rpc("verify_guest_purchase_otp", { p_challenge: tokenHash(challenge), p_code: securityHash(`purchase-otp:${challenge}:${code}`), p_session: tokenHash(session) });
      if (result.error) throw Error("Unable to verify code.");
      if (!result.data) return privateJson({ error: "Invalid or expired code. Request a new code if needed." }, 400);
      const previous = request.cookies.get(GUEST_PURCHASE_COOKIE)?.value;
      if (previous && validPurchaseToken(previous)) await db.from("guest_purchase_sessions").delete().eq("token_hash", tokenHash(previous));
      const response = privateJson({ verified: true, email: result.data, source: "guest" });
      response.cookies.set(GUEST_PURCHASE_COOKIE, session, { ...purchaseCookieOptions, maxAge: 3600 });
      response.cookies.set(GUEST_CHALLENGE_COOKIE, "", { ...purchaseCookieOptions, maxAge: 0 });
      return response;
    }
    return privateJson({ error: "Invalid verification action." }, 400);
  } catch { return privateJson({ error: "Verification is temporarily unavailable. Please try again." }, 503); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return privateJson({ error: "Invalid request origin." }, 403);
  const response = privateJson({ verified: false });
  try {
    const token = request.cookies.get(GUEST_PURCHASE_COOKIE)?.value ?? "";
    if (validPurchaseToken(token)) {
      const removed = await createAdminClient().from("guest_purchase_sessions").delete().eq("token_hash", tokenHash(token));
      if (removed.error) return privateJson({ error: "Unable to end this session. Please retry." }, 503);
    }
    response.cookies.set(GUEST_PURCHASE_COOKIE, "", { ...purchaseCookieOptions, maxAge: 0 });
    response.cookies.set(GUEST_CHALLENGE_COOKIE, "", { ...purchaseCookieOptions, maxAge: 0 });
    return response;
  } catch { return privateJson({ error: "Unable to end this session. Please retry." }, 503); }
}
