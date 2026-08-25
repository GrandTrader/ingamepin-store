import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const FREEKASSA_CHECKOUT_URL = "https://pay.fk.money/";
const FREEKASSA_API_URL = "https://api.fk.life/v1/orders/create";

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

export function getFreeKassaMerchantId() {
  return requiredEnvironmentValue("FREEKASSA_MERCHANT_ID");
}

function getFreeKassaSecretWord1() {
  return requiredEnvironmentValue("FREEKASSA_SECRET_WORD_1");
}

function getFreeKassaApiKey() {
  return requiredEnvironmentValue("FREEKASSA_API_KEY");
}

export function getFreeKassaSecretWord2() {
  return requiredEnvironmentValue("FREEKASSA_SECRET_WORD_2");
}

function safeHashEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "utf8");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createFreeKassaCheckoutUrl(input: {
  amount: string;
  currency: "RUB";
  orderId: string;
  email: string;
  language?: "en" | "ru";
  paymentSystemId?: number;
}) {
  const merchantId = getFreeKassaMerchantId();
  const signature = createHash("md5")
    .update(
      `${merchantId}:${input.amount}:${getFreeKassaSecretWord1()}:${input.currency}:${input.orderId}`,
    )
    .digest("hex");
  const url = new URL(FREEKASSA_CHECKOUT_URL);

  url.searchParams.set("m", merchantId);
  url.searchParams.set("oa", input.amount);
  url.searchParams.set("currency", input.currency);
  url.searchParams.set("o", input.orderId);
  url.searchParams.set("s", signature);
  url.searchParams.set("em", input.email);
  url.searchParams.set("lang", input.language ?? "en");
  if (input.paymentSystemId) {
    url.searchParams.set("i", String(input.paymentSystemId));
  }

  return url.toString();
}

export async function createFreeKassaApiOrder(input: {
  amount: string;
  currency: "RUB";
  paymentId: string;
  email: string;
  ip: string;
  paymentSystemId: 44;
}) {
  const values: Record<string, string | number> = {
    shopId: Number(getFreeKassaMerchantId()),
    nonce: Date.now(),
    paymentId: input.paymentId,
    i: input.paymentSystemId,
    email: input.email,
    ip: input.ip,
    amount: input.amount,
    currency: input.currency,
  };
  const signatureSource = Object.keys(values)
    .sort()
    .map((key) => String(values[key]))
    .join("|");
  const signature = createHmac("sha256", getFreeKassaApiKey())
    .update(signatureSource)
    .digest("hex");
  const response = await fetch(FREEKASSA_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...values, signature }),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as
    | { type?: string; location?: string; message?: string; error?: string }
    | null;

  if (!response.ok || result?.type !== "success" || !result.location) {
    throw new Error(
      result?.message ||
        result?.error ||
        `FreeKassa API returned HTTP ${response.status}.`,
    );
  }

  return result.location;
}

export function verifyFreeKassaNotification(input: {
  merchantId: string;
  amount: string;
  orderId: string;
  signature: string;
}) {
  if (
    !input.merchantId ||
    !input.amount ||
    !input.orderId ||
    !input.signature ||
    input.merchantId !== getFreeKassaMerchantId()
  ) {
    return false;
  }

  const expected = createHash("md5")
    .update(
      `${input.merchantId}:${input.amount}:${getFreeKassaSecretWord2()}:${input.orderId}`,
    )
    .digest("hex");

  return safeHashEquals(input.signature, expected);
}
