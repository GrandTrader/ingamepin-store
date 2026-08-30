import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type SignableValue = string | number;

let cachedDigisellerToken: { value: string; validUntil: number } | null = null;

// Orders created before the signature-format fix were already resolved
// manually. Never reactivate them through a delayed callback or status retry.
const DIGISELLER_SAFE_STATUS_CUTOFF = Date.parse(
  "2026-08-28T03:43:35.759Z",
);

export function canSendDigisellerPaidStatus(createdAt: string) {
  const createdTime = Date.parse(createdAt);
  return (
    Number.isFinite(createdTime) &&
    createdTime >= DIGISELLER_SAFE_STATUS_CUTOFF
  );
}

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

async function getDigisellerToken() {
  const sellerId = Number(process.env.DIGISELLER_SELLER_ID?.trim());
  const apiKey = process.env.DIGISELLER_API_KEY?.trim();
  if (!Number.isSafeInteger(sellerId) || sellerId <= 0 || !apiKey) {
    throw new Error("DigiSeller API credentials are not configured.");
  }

  if (
    cachedDigisellerToken &&
    cachedDigisellerToken.validUntil > Date.now() + 30_000
  ) {
    return cachedDigisellerToken.value;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = createHash("sha256")
      .update(`${apiKey}${timestamp}`)
      .digest("hex");
    const loginResponse = await fetch("https://api.digiseller.com/api/apilogin", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ seller_id: sellerId, timestamp, sign }),
      cache: "no-store",
    });
    const login = (await loginResponse.json().catch(() => null)) as {
      retval?: number;
      token?: string;
      desc?: string;
      endesc?: string;
      retdesc?: string;
      valid_thru?: string;
    } | null;
    if (loginResponse.ok && login?.retval === 0 && login.token) {
      const reportedExpiry = Date.parse(login.valid_thru ?? "");
      cachedDigisellerToken = {
        value: login.token,
        validUntil: Number.isFinite(reportedExpiry)
          ? reportedExpiry
          : Date.now() + 90 * 60 * 1000,
      };
      return login.token;
    }
    if (login?.retval === -4 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      continue;
    }
    throw new Error(
      login?.endesc ||
        login?.desc ||
        login?.retdesc ||
        "DigiSeller status login failed.",
    );
  }

  throw new Error("DigiSeller status login failed.");
}

async function getDigisellerInvoiceState(invoiceId: string) {
  const token = await getDigisellerToken();

  const statusResponse = await fetch(
    `https://api.digiseller.com/api/purchase/info/${encodeURIComponent(invoiceId)}?token=${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  const status = (await statusResponse.json().catch(() => null)) as {
    retval?: number;
    retdesc?: string;
    content?: { invoice_state?: number };
  } | null;
  if (!statusResponse.ok || status?.retval !== 0) {
    throw new Error(status?.retdesc || "DigiSeller status check failed.");
  }
  return Number(status.content?.invoice_state ?? 0);
}

export async function isDigisellerPaid(invoiceId: string) {
  return (await getDigisellerInvoiceState(invoiceId)) === 3;
}

export async function notifyDigiseller(input: {
  invoiceId: string;
  amount: string;
  currency: string;
  status: "paid" | "wait" | "canceled" | "refunded" | "error";
}) {
  if (input.status === "paid" && (await isDigisellerPaid(input.invoiceId))) {
    return "already-paid";
  }

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

  if (input.status === "paid") {
    // DigiSeller's callback can return HTTP 200 before its invoice state is
    // actually updated. Only let callers mark the notification as complete
    // after the authoritative purchase API reports a successful payment.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await isDigisellerPaid(input.invoiceId)) return normalizedResponse;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error("DigiSeller has not confirmed the paid status yet.");
  }

  return normalizedResponse;
}
