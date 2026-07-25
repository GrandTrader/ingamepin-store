import { createHash, timingSafeEqual } from "node:crypto";

const FREEKASSA_CHECKOUT_URL = "https://pay.fk.money/";

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

  return url.toString();
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