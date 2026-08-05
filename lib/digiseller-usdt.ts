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

  const response = await fetch(url, { cache: "no-store" });
  const responseText = await response.text();
  const normalizedResponse = responseText.trim();
  if (!response.ok) {
    throw new Error(
      `Digiseller callback failed with HTTP ${response.status}${
        responseText ? `: ${responseText.slice(0, 300)}` : "."
      }`,
    );
  }

  if (/^error\s*:/i.test(normalizedResponse)) {
    throw new Error(`Digiseller rejected the callback: ${normalizedResponse}`);
  }

  if (normalizedResponse.startsWith("{")) {
    try {
      const result = JSON.parse(responseText) as {
        error?: unknown;
        status?: unknown;
      };
      const error = typeof result.error === "string" ? result.error.trim() : "";
      if (error) {
        throw new Error(`Digiseller rejected the callback: ${error}`);
      }
      if (typeof result.status === "string" && result.status !== input.status) {
        throw new Error(
          `Digiseller returned payment status ${result.status} instead of ${input.status}.`,
        );
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Digiseller returned an invalid callback response.");
      }
      throw error;
    }
  }
}
