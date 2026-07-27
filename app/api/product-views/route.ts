import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VISITOR_COOKIE = "igp_product_visitor";
const BOT_PATTERN =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed/i;

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get("user-agent") ?? "";

    if (!userAgent || BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ tracked: false });
    }

    const body = (await request.json()) as {
      productId?: unknown;
    };
    const productId = String(body.productId ?? "").trim();

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

    const existingVisitorId =
      request.cookies.get(VISITOR_COOKIE)?.value ?? "";
    const visitorId =
      /^[0-9a-f-]{36}$/i.test(existingVisitorId)
        ? existingVisitorId
        : randomUUID();
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

    const response = NextResponse.json({ tracked: true });

    if (visitorId !== existingVisitorId) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    console.error("Product view tracking failed:", error);
    return NextResponse.json(
      { error: "Unable to record view." },
      { status: 500 },
    );
  }
}
