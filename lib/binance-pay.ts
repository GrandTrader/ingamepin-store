import { createHmac, randomBytes } from "node:crypto";

const BINANCE_PAY_HOST = "https://bpay.binanceapi.com";

type BinanceResponse<T> = {
  status: "SUCCESS" | "FAIL";
  code: string;
  data?: T;
  errorMessage?: string;
};

function credentials() {
  const apiKey = process.env.BINANCE_PAY_API_KEY;
  const secretKey = process.env.BINANCE_PAY_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error("Binance Pay merchant keys are missing.");
  }

  return { apiKey, secretKey };
}

export async function callBinancePay<T>(
  path: string,
  body: Record<string, unknown>
) {
  const { apiKey, secretKey } = credentials();
  const timestamp = Date.now().toString();
  const nonce = randomBytes(16).toString("hex");
  const jsonBody = JSON.stringify(body);
  const payload = `${timestamp}\n${nonce}\n${jsonBody}\n`;
  const signature = createHmac("sha512", secretKey)
    .update(payload)
    .digest("hex")
    .toUpperCase();

  const response = await fetch(`${BINANCE_PAY_HOST}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "BinancePay-Timestamp": timestamp,
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": apiKey,
      "BinancePay-Signature": signature,
    },
    body: jsonBody,
    cache: "no-store",
  });

  const result = (await response.json()) as BinanceResponse<T>;

  if (!response.ok || result.status !== "SUCCESS" || !result.data) {
    throw new Error(
      result.errorMessage ||
        `Binance Pay request failed (${result.code || response.status}).`
    );
  }

  return result.data;
}

export type BinanceCreateOrderResult = {
  prepayId: string;
  expireTime: number;
  checkoutUrl: string;
  universalUrl: string;
  qrcodeLink: string;
  qrContent: string;
  currency: string;
  totalFee: string;
  fiatCurrency?: string;
  fiatAmount?: string;
};
