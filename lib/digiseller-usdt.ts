import { createHmac, timingSafeEqual } from "node:crypto";

type SignableValue = string | number;

function secretKey() {
  const value = process.env.DIGISELLER_PAYMENT_SECRET_KEY?.trim();
  if (!value) throw new Error("Digiseller payment secret key is missing.");
  return value;
}

export function signDigiseller(values: Record<string, SignableValue>) {
  const payload = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value};`)
    .join("");
  return createHmac("sha256", secretKey()).update(payload).digest("hex");
}

export function verifyDigiseller(
  values: Record<string, SignableValue>,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signDigiseller(values), "hex");
  const received = Buffer.from(signature.toLowerCase(), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function notifyDigiseller(input: {
  invoiceId: string;
  amount: string;
  currency: string;
  status: "paid" | "wait" | "canceled" | "refunded" | "error";
  transactionHash?: string | null;
}) {
  const signed = {
    invoice_id: input.invoiceId,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
  };
  const url = new URL("https://oplata.info/callback/api");
  for (const [key, value] of Object.entries(signed)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("signature", signDigiseller(signed));
  url.searchParams.set("integrator", "InGamePin Direct USDT");
  if (input.transactionHash) {
    url.searchParams.set("transaction_id", input.transactionHash);
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Digiseller callback failed with HTTP ${response.status}.`);
  }
}