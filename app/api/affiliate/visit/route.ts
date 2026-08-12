import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VISITOR_COOKIE = "igp_affiliate_visitor";
const CLICK_COOKIE = "igp_affiliate_click";
const CODE_COOKIE = "igp_affiliate_code";

type VisitRequest = {
  affiliateCode?: unknown;
  productId?: unknown;
  landingPath?: unknown;
  referrerUrl?: unknown;
};

function cleanText(value: unknown, maximumLength: number) {
  return String(value ?? "").trim().slice(0, maximumLength);
}

function secureHash(value: string, secret: string) {
  return createHash("sha256")
    .update(`${secret}:${value}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VisitRequest;
    const affiliateCode = cleanText(body.affiliateCode, 80).toUpperCase();
    const productId = cleanText(body.productId, 80);
    const landingPath = cleanText(body.landingPath, 1000);
    const referrerUrl = cleanText(body.referrerUrl, 1000) || null;

    if (
      !affiliateCode ||
      !productId ||
      !landingPath.startsWith("/product/") &&
      !landingPath.startsWith("/category/")
    ) {
      return NextResponse.json(
        { tracked: false },
        { status: 400 },
      );
    }

    const hashSecret =
      process.env.AFFILIATE_HASH_SECRET ??
      process.env.SUPABASE_SECRET_KEY;

    if (!hashSecret) {
      throw new Error("Affiliate hash secret is missing.");
    }

    const admin = createAdminClient();
    const [settingsResult, affiliateResult, productResult] =
      await Promise.all([
        admin
          .from("affiliate_settings")
          .select("program_enabled, cookie_days")
          .eq("id", 1)
          .maybeSingle(),
        admin
          .from("affiliate_accounts")
          .select("id")
          .eq("affiliate_code", affiliateCode)
          .eq("status", "APPROVED")
          .maybeSingle(),
        admin
          .from("products")
          .select("id")
          .eq("id", productId)
          .eq("status", "ACTIVE")
          .eq("affiliate_enabled", true)
          .maybeSingle(),
      ]);

    if (
      settingsResult.error ||
      affiliateResult.error ||
      productResult.error
    ) {
      throw new Error("Unable to validate affiliate visit.");
    }

    const settings = settingsResult.data;
    const affiliate = affiliateResult.data;
    const product = productResult.data;

    if (!settings?.program_enabled || !affiliate || !product) {
      return NextResponse.json({ tracked: false });
    }

    const visitorToken =
      request.cookies.get(VISITOR_COOKIE)?.value ?? randomUUID();
    const visitorTokenHash = secureHash(visitorToken, hashSecret);
    const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
    const visitorIp = forwardedFor.split(",")[0]?.trim() ?? "";
    const userAgent = request.headers.get("user-agent") ?? "";
    const ipHash = visitorIp
      ? secureHash(visitorIp, hashSecret)
      : null;
    const deviceHash = userAgent
      ? secureHash(userAgent, hashSecret)
      : null;
    const duplicateWindow = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const existingResult = await admin
      .from("affiliate_clicks")
      .select("id")
      .eq("affiliate_id", affiliate.id)
      .eq("product_id", product.id)
      .eq("visitor_token_hash", visitorTokenHash)
      .is("converted_order_id", null)
      .gte("created_at", duplicateWindow)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingResult.error) {
      throw existingResult.error;
    }

    let clickId = existingResult.data?.id ?? null;

    if (!clickId) {
      const insertResult = await admin
        .from("affiliate_clicks")
        .insert({
          affiliate_id: affiliate.id,
          product_id: product.id,
          visitor_token_hash: visitorTokenHash,
          ip_hash: ipHash,
          device_hash: deviceHash,
          landing_path: landingPath,
          referrer_url: referrerUrl,
        })
        .select("id")
        .single();

      if (insertResult.error) {
        throw insertResult.error;
      }

      clickId = insertResult.data.id;
    }

    const response = NextResponse.json({ tracked: true });
    const maxAge = Math.max(1, Number(settings.cookie_days ?? 30)) * 86400;
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge,
    };

    response.cookies.set(VISITOR_COOKIE, visitorToken, cookieOptions);
    response.cookies.set(CLICK_COOKIE, clickId, cookieOptions);
    response.cookies.set(CODE_COOKIE, affiliateCode, cookieOptions);

    return response;
  } catch (error) {
    console.error("Affiliate visit tracking failed", error);

    return NextResponse.json(
      { tracked: false },
      { status: 500 },
    );
  }
}
