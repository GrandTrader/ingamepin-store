import "server-only";

type PayPalEnvironment = "sandbox" | "live";

export function getPayPalConfiguration() {
  const environment = process.env.PAYPAL_ENVIRONMENT?.trim();
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if ((environment !== "sandbox" && environment !== "live") || !clientId || !secret) {
    throw new Error("PayPal is not configured.");
  }
  return {
    environment: environment as PayPalEnvironment,
    clientId,
    secret,
    baseUrl: environment === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com",
  };
}

export class PayPalError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number) {
    super("PayPal could not complete this request. Please try again.");
    this.name = "PayPalError";
  }
}

export type PayPalOrder = {
  id: string;
  intent?: string;
  status: string;
  links?: Array<{ href?: string; rel?: string; method?: string }>;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payee?: { merchant_id?: string };
    payments?: { captures?: Array<{
      id?: string;
      status?: string;
      final_capture?: boolean;
      amount?: { currency_code?: string; value?: string };
    }> };
  }>;
};

// Only this server module handles the secret and OAuth access token.
export async function paypalRequest<T>(path: string, method: "GET" | "POST", body?: unknown, requestId?: string): Promise<T> {
  if (!/^\/v2\/checkout\/orders(?:\/[A-Z0-9]{10,32}(?:\/capture)?)?$/.test(path) && !(method === "POST" && path === "/v1/notifications/verify-webhook-signature")) {
    throw new Error("Invalid PayPal endpoint.");
  }
  if (method === "POST" && (!requestId || requestId.length > 108)) {
    throw new Error("A PayPal idempotency key is required.");
  }
  const config = getPayPalConfiguration();
  const authResponse = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const auth = await authResponse.json().catch(() => null);
  if (!authResponse.ok || typeof auth?.access_token !== "string" || !auth.access_token) {
    throw new PayPalError("AUTHENTICATION_FAILED", authResponse.status);
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    ...(body === undefined ? {} : { body: typeof body === "string" && path === "/v1/notifications/verify-webhook-signature" ? body : JSON.stringify(body) }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const issue = result?.details?.[0]?.issue ?? result?.name;
    throw new PayPalError(typeof issue === "string" && /^[A-Z_]+$/.test(issue) ? issue : "REQUEST_FAILED", response.status);
  }
  return result as T;
}
