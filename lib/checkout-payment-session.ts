import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function expireUnpaidCheckouts(orderIds?: string[]) {
  if (orderIds && !orderIds.length) return 0;
  const result = await createAdminClient().rpc("expire_unpaid_checkout_orders", {
    p_limit: orderIds ? Math.min(orderIds.length, 500) : 200, p_order_ids: orderIds ?? null,
  });
  if (result.error) throw Error("Unable to refresh the payment window.");
  return Number(result.data ?? 0);
}

export async function assertCheckoutOpen(orderId: string) {
  const admin = createAdminClient();
  const expired = await admin.rpc("expire_unpaid_checkout", { p_order_id: orderId });
  if (expired.error) throw Error("Unable to check the payment window.");
  const open = await admin.rpc("assert_checkout_open", { p_order_id: orderId });
  if (open.error) throw Error(open.error.code === "P0001" ? open.error.message : "Unable to check the payment window.");
}

export async function runCheckoutSession(request: NextRequest, method: string, handler: (r: NextRequest, claim: () => Promise<void>, existingUrl?: string) => Promise<NextResponse>) {
  try {
    const body = await request.clone().json();
    if (typeof body?.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orderId) ||
        typeof body.accessToken !== "string" || body.accessToken.length < 40 || body.accessToken.length > 128)
      return NextResponse.json({ error: "Invalid order access." }, { status: 403 });
    const admin = createAdminClient();
    const order = await admin.from("orders").select("access_token_hash").eq("id", body.orderId).maybeSingle();
    const hash = order.data?.access_token_hash;
    if (order.error || typeof hash !== "string" || !/^[a-f0-9]{64}$/i.test(hash) ||
        !timingSafeEqual(createHash("sha256").update(body.accessToken).digest(), Buffer.from(hash, "hex")))
      return NextResponse.json({ error: "Order access was denied." }, { status: 403 });
    await assertCheckoutOpen(body.orderId);
    const payment = await admin.from("payments").select("id,method,status,submitted_at,verified_at,transaction_id,gateway_order_id,gateway_checkout_url")
      .eq("order_id", body.orderId).single();
    const saved = payment.data;
    if (payment.error || !saved || saved.method !== method || saved.status !== "PENDING" ||
        saved.submitted_at || saved.verified_at || saved.transaction_id)
      throw Error("Check this order payment status before paying again.");
    let creationToken: string | null = null;
    async function claim() {
      const session = await admin.rpc("begin_checkout_session", { p_order_id: body.orderId, p_method: method });
      if (session.error || !session.data) throw Error(session.error?.code === "P0001" ? session.error.message : "Unable to prepare payment.");
      if (session.data.gateway_order_id) throw Error("A payment link is ready. Retry this order to open it.");
      creationToken = session.data.checkout_creation_token;
      if (!creationToken) throw Error("Unable to reserve this payment session.");
    }
    if (saved.gateway_order_id && saved.gateway_checkout_url) {
      const url = new URL(saved.gateway_checkout_url);
      if (url.protocol !== "https:" || url.username || url.password) throw Error("Invalid payment link.");
      if (method === "PALLY") return handler(request, claim, url.href);
      return NextResponse.json({ checkoutUrl: url.href }, { headers: { "Cache-Control": "no-store" } });
    }
    const response = await handler(request, claim);
    if (response.ok && creationToken) {
      const body = await response.clone().json();
      const update = await admin.from("payments").update({
        ...(typeof body.checkoutUrl === "string" ? { gateway_checkout_url: body.checkoutUrl } : {}),
        checkout_creation_token: null,
      }).eq("id", saved.id).eq("checkout_creation_token", creationToken)
        .not("gateway_order_id", "is", null).select("id").single();
      if (update.error) throw Error("Unable to save the payment session. Check this order before paying again.");
    }
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to resume payment." },
      { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
