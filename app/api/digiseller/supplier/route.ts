import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SupplierRequest = {
  id?: string | number;
  inv?: string | number;
  amount?: number;
  type_curr?: string;
  sign?: string;
  product_id?: string | number;
  count?: string | number;
  options?: Array<{ id?: string | number; user_data?: string | number }>;
};

const emptyTestResponse = { id: "", inv: 0, goods: "", product_id: "", count: 0, error: "" };

function safeEqualHex(received: string, expected: string) {
  if (!/^[a-f\d]+$/i.test(received) || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received.toLowerCase()), Buffer.from(expected));
}

function requiredSecret(name: "DIGISELLER_API_KEY" | "DIGISELLER_SUPPLIER_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function resolveWebsiteOption(admin: ReturnType<typeof createAdminClient>, productId: number, options: SupplierRequest["options"]) {
  const variantIds = (options ?? []).map((option) => positiveInteger(option.user_data)).filter((value): value is number => value !== null);
  let query = admin.from("product_options").select("id").eq("digiseller_product_id", productId).eq("is_active", true);
  query = variantIds.length > 0 ? query.in("digiseller_variant_id", variantIds) : query.is("digiseller_variant_id", null);
  return query.maybeSingle();
}

export async function POST(request: Request) {
  let body: SupplierRequest;
  try {
    body = await request.json() as SupplierRequest;
  } catch {
    return NextResponse.json(emptyTestResponse);
  }

  if (Object.keys(body).length === 0) return NextResponse.json(emptyTestResponse);

  const admin = createAdminClient();
  const signature = String(body.sign ?? "").trim();

  if (body.product_id !== undefined) {
    const productId = positiveInteger(body.product_id);
    const requestedCount = positiveInteger(body.count);
    if (!productId || !requestedCount) return NextResponse.json({ error: "Invalid quantity request." }, { status: 400 });
    const signingKeys = [process.env.DIGISELLER_API_KEY, process.env.DIGISELLER_SUPPLIER_SECRET].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
    const signatureIsValid = signingKeys.some((key) => safeEqualHex(signature, createHash("sha256").update(`${productId}:${requestedCount}:${key}`).digest("hex")));
    if (!signatureIsValid) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    const option = await resolveWebsiteOption(admin, productId, body.options);
    if (option.error || !option.data) return NextResponse.json({ product_id: String(productId), count: 0, error: "Product is not connected." });
    const stock = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("product_option_id", option.data.id).eq("status", "AVAILABLE");
    if (stock.error) return NextResponse.json({ product_id: String(productId), count: 0, error: "Stock is temporarily unavailable." });
    return NextResponse.json({ product_id: String(productId), count: stock.count ?? 0, error: "" });
  }

  const productId = positiveInteger(body.id);
  const invoiceId = positiveInteger(body.inv);
  if (!productId || !invoiceId) return NextResponse.json({ error: "Invalid delivery request." }, { status: 400 });
  const expected = createHash("md5").update(`${productId}:${invoiceId}:${requiredSecret("DIGISELLER_SUPPLIER_SECRET")}`).digest("hex");
  if (!safeEqualHex(signature, expected)) return NextResponse.json({ id: String(productId), inv: invoiceId, error: "Invalid signature." }, { status: 401 });

  const option = await resolveWebsiteOption(admin, productId, body.options);
  if (option.error || !option.data) return NextResponse.json({ id: String(productId), inv: invoiceId, error: "Product denomination is not connected." });

  const delivery = await admin.rpc("fulfill_digiseller_order", {
    p_invoice_id: invoiceId,
    p_digiseller_product_id: productId,
    p_product_option_id: option.data.id,
  });
  if (delivery.error || !delivery.data?.[0]?.goods) {
    return NextResponse.json({ id: String(productId), inv: invoiceId });
  }
  return NextResponse.json({ id: String(productId), inv: invoiceId, goods: delivery.data[0].goods, error: "" });
}

export function GET() {
  return NextResponse.json(emptyTestResponse);
}
