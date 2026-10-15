import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { consumeRate, privateJson, requestLimit, sameOrigin, securityHash } from "@/lib/request-security";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { readJsonBody, RequestBodyError } from "@/lib/read-json-body";

export const runtime = "nodejs";

const VISITOR_COOKIE = "igp_product_visitor";
const BOT_PATTERN =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed/i;

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return privateJson({ tracked: false }, 403);
    const userAgent = request.headers.get("user-agent") ?? "";

    if (!userAgent || BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ tracked: false });
    }

    const limited = await requestLimit(request, "product-views", 120, 60);
    if (limited) return limited;
    const body = (await readJsonBody(request, 1024)) as { productId?: unknown } | null;
    const productId = String(body?.productId ?? "").trim();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        productId,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid product." },
        { status: 400 },
      );
    }

    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (user) {
      const adminResult = await sessionClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminResult.data) {
        return NextResponse.json({ tracked: false });
      }
    }

    const ip = trustedClientIp(request.headers);
    if (!ip) return privateJson({ tracked: false }, 503);
    // Cookie resets cannot create unlimited new visitors. Anonymous visitors on
    // a shared network may be counted together; these statistics are estimates.
    const identity = user ? `user:${user.id}` : `ip:${ip}`;
    if (!(await consumeRate("product-view-daily", `${productId}:${identity}`, 1, 86400))) {
      return privateJson({ tracked: false });
    }
    const cookie = request.cookies.get(VISITOR_COOKIE)?.value ?? "";
    const [existingVisitorId, signature] = cookie.split(".");
    const expected = securityHash(`product-visitor:${existingVisitorId}`);
    const validCookie = /^[0-9a-f-]{36}$/i.test(existingVisitorId ?? "") &&
      /^[0-9a-f]{64}$/.test(signature ?? "") &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const visitorId = validCookie ? existingVisitorId : randomUUID();
    const visitorHash = createHash("sha256")
      .update(visitorId)
      .digest("hex");

    const admin = createAdminClient();
    const viewResult = await admin
      .from("product_views")
      .upsert(
        {
          product_id: productId,
          visitor_hash: visitorHash,
          last_viewed_at: new Date().toISOString(),
        },
        {
          onConflict: "product_id,visitor_hash",
        },
      );

    if (viewResult.error) {
      console.error("Unable to record product view:", viewResult.error);
      return NextResponse.json(
        { error: "Unable to record view." },
        { status: 500 },
      );
    }

    const response = privateJson({ tracked: true });

    if (!validCookie) {
      response.cookies.set(VISITOR_COOKIE, `${visitorId}.${securityHash(`product-visitor:${visitorId}`)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ tracked: false }, error.status);
    console.error("Product view tracking failed:", error);
    return NextResponse.json(
      { error: "Unable to record view." },
      { status: 500 },
    );
  }
}
