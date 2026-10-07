import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { consumeRate, privateJson } from "@/lib/request-security";
import { createPayPalSandboxOrder, capturePayPalSandboxOrder, paypalSandboxConfiguration } from "@/lib/paypal-sandbox";
import { paypalRequestOrigin } from "@/lib/paypal-request-origin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const returnOrigin = paypalRequestOrigin(request);
    if (!returnOrigin) {
      return privateJson({ error: "Invalid request origin." }, 403);
    }
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || !(await hasRequiredAdminAssurance(client))) return privateJson({ error: "Sign in as an administrator and complete verification." }, 401);
    const access = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (access.error || !access.data) return privateJson({ error: "Administrator access is required." }, 403);
    paypalSandboxConfiguration();
    if (!(await consumeRate("paypal-sandbox", user.id, 20, 300))) return privateJson({ error: "Too many test requests. Please wait a few minutes." }, 429);
    const raw = await request.text();
    if (raw.length > 4096) return privateJson({ error: "Invalid test request." }, 400);
    const body = JSON.parse(raw) as { action?: unknown; sessionToken?: unknown };
    if (body?.action === "create") return privateJson(await createPayPalSandboxOrder(user.id, returnOrigin));
    if (body?.action === "capture" && typeof body.sessionToken === "string") return privateJson(await capturePayPalSandboxOrder(body.sessionToken, user.id));
    return privateJson({ error: "Invalid test request." }, 400);
  } catch {
    // Never expose PayPal response bodies, credentials, or payer details.
    return privateJson({ error: "The PayPal test could not be completed. If you approved it, use Verify payment to check the same payment again." }, 502);
  }
}
