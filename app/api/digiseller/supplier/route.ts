import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getDigiSellerPurchaseSelection } from "@/lib/digiseller-api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SupplierRequest = {
  id?: string | number;
  inv?: string | number;
  amount?: number;
  type_curr?: string;
  sign?: string;
  sign2?: string;
  product_id?: string | number;
  count?: string | number;
  options?: Array<{ id?: string | number; user_data?: string | number; user_data_id?: string | number }>;
};

const emptyTestResponse = { id: "", inv: 0, goods: "", product_id: "", count: 0, error: "" };
const deliveryTestResponse = { id: "", inv: 0, goods: "Supplier endpoint test successful", error: "" };
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://my.digiseller.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: object) {
  return NextResponse.json(body, { headers: corsHeaders });
}

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
  const selections = options ?? [];
  const variantIds = selections
    .map((option) => positiveInteger(option.user_data_id) ?? positiveInteger(option.user_data))
    .filter((value): value is number => value !== null);
  const query = admin.from("product_options").select("id, product_id").eq("digiseller_product_id", productId).eq("is_active", true);
  if (variantIds.length === 0) return query.is("digiseller_variant_id", null).maybeSingle();

  const variantMatch = await query.in("digiseller_variant_id", variantIds).maybeSingle();
  if (variantMatch.error || variantMatch.data) return variantMatch;

  const denominations = selections
    .map((option) => Number(option.user_data))
    .filter((value) => Number.isFinite(value) && value > 0);
  let denominationQuery = admin
    .from("product_options")
    .select("id, product_id")
    .eq("digiseller_product_id", productId)
    .eq("is_active", true)
    .in("denomination", denominations);
  const optionIds = selections
    .map((option) => positiveInteger(option.id))
    .filter((value): value is number => value !== null);
  if (optionIds.length > 0) {
    denominationQuery = denominationQuery.in("digiseller_option_id", optionIds);
  }
  return denominationQuery.maybeSingle();
}

async function availableQuantity(admin: ReturnType<typeof createAdminClient>, option: { id: string; product_id: string }) {
  const product = await admin.from("products").select("stock_source").eq("id", option.product_id).single();
  if (product.error) return 0;
  if (product.data.stock_source === "DEFINITEPLAY") {
    const result = await admin.rpc("digiseller_supplier_available", { p_option_id: option.id });
    return result.error ? 0 : Math.max(0, Math.min(1000, Number(result.data) || 0));
  }
  const stock = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("product_option_id", option.id).eq("status", "AVAILABLE");
  return stock.error ? 0 : stock.count ?? 0;
}

export async function POST(request: Request) {
  let body: SupplierRequest;
  try {
    body = await request.json() as SupplierRequest;
  } catch {
    return json(deliveryTestResponse);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return json(emptyTestResponse);
  if (body.options !== undefined && (!Array.isArray(body.options) || body.options.some((option) => !option || typeof option !== "object"))) return json(emptyTestResponse);
  if (Object.keys(body).length === 0) return json(deliveryTestResponse);

  const admin = createAdminClient();
  const signature = String(body.sign ?? "").trim();

  if (body.product_id !== undefined) {
    const productId = positiveInteger(body.product_id);
    const requestedCount = positiveInteger(body.count);
    if (!productId || !requestedCount) return json(emptyTestResponse);
    const suppliedVariantIds = (body.options ?? []).map((option) => positiveInteger(option.user_data_id) ?? positiveInteger(option.user_data)).filter((value): value is number => value !== null);
    if (suppliedVariantIds.length === 0) {
      const mapped = await admin.from("product_options").select("id, product_id").eq("digiseller_product_id", productId).eq("is_active", true);
      if (mapped.error || !mapped.data?.length) return json({ product_id: String(productId), count: 0, error: "Product is not connected." });
      const counts = await Promise.all(mapped.data.map((option) => availableQuantity(admin, option)));
      return json({ product_id: String(productId), count: Math.min(...counts), error: "" });
    }
    const option = await resolveWebsiteOption(admin, productId, body.options);
    if (option.error || !option.data) return json({ product_id: String(productId), count: 0, error: "Product is not connected." });
    return json({ product_id: String(productId), count: await availableQuantity(admin, option.data), error: "" });
  }

  const productId = positiveInteger(body.id);
  const invoiceId = positiveInteger(body.inv);
  if (!productId || !invoiceId) return json(deliveryTestResponse);
  const deliverySigningKeys = [process.env.DIGISELLER_SUPPLIER_SECRET, process.env.DIGISELLER_API_KEY].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  if (!deliverySigningKeys.length) requiredSecret("DIGISELLER_SUPPLIER_SECRET");
  const signatureIsValid = deliverySigningKeys.some((key) =>
    safeEqualHex(String(body.sign2 ?? "").trim(), createHash("sha256").update(`${productId}:${invoiceId}:${key}`).digest("hex")) ||
    safeEqualHex(signature, createHash("md5").update(`${productId}:${invoiceId}:${key}`).digest("hex")));
  if (!signatureIsValid) return json({ id: String(productId), inv: invoiceId, goods: "", error: "Invalid signature." });

  // Signatures do not cover options or amount: verify the invoice independently.
  let purchase: Awaited<ReturnType<typeof getDigiSellerPurchaseSelection>>;
  try { purchase = await getDigiSellerPurchaseSelection(invoiceId); }
  catch { return json({ id: String(productId), inv: invoiceId }); }
  if (purchase.productId !== productId || purchase.invoiceState !== 3 || !Number.isSafeInteger(purchase.quantity) || purchase.quantity < 1 || purchase.quantity > 1000) {
    return json({ id: String(productId), inv: invoiceId });
  }
  const option = await resolveWebsiteOption(admin, productId, purchase.options);
  if (option.error || !option.data) return json({ id: String(productId), inv: invoiceId });
  const product = await admin.from("products").select("stock_source").eq("id", option.data.product_id).single();
  if (product.error) return json({ id: String(productId), inv: invoiceId });
  const existingJob = await admin.from("digiseller_supplier_jobs").select("invoice_id").eq("invoice_id", invoiceId).maybeSingle();
  if (existingJob.error && product.data.stock_source === "DEFINITEPLAY") return json({ id: String(productId), inv: invoiceId });
  if (product.data.stock_source === "DEFINITEPLAY" || existingJob.data) {
    // Convert net proceeds using DigiSeller's own amounts, never callback amounts.
    const { amount, amountUsd, profit } = purchase;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(amountUsd) || amountUsd <= 0 || profit === null || !Number.isFinite(profit) || profit <= 0 || profit > amount) {
      return json({ id: String(productId), inv: invoiceId });
    }
    const netUsd = Math.floor((amountUsd * profit / amount) * 1e8) / 1e8;
    const job = await admin.rpc("queue_digiseller_supplier_order", {
      p_invoice_id: invoiceId, p_product_id: productId, p_option_id: option.data.id,
      p_quantity: purchase.quantity, p_net_revenue_usd: netUsd,
    });
    // Omit goods and error while pending so DigiSeller retries automatically.
    if (job.error || !job.data) return json({ id: String(productId), inv: invoiceId });
    return json({ id: String(productId), inv: invoiceId, goods: job.data, error: "" });
  }

  const delivery = await admin.rpc("fulfill_digiseller_order", {
    p_invoice_id: invoiceId,
    p_digiseller_product_id: productId,
    p_product_option_id: option.data.id,
  });
  if (delivery.error || !delivery.data?.[0]?.goods) {
    return json({ id: String(productId), inv: invoiceId });
  }
  return json({ id: String(productId), inv: invoiceId, goods: delivery.data[0].goods, error: "" });
}

export function GET() {
  return json(deliveryTestResponse);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
