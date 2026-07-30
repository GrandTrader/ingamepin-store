export type UsdtNetwork = "TRC20" | "BEP20" | "SOLANA";

export type UsdtInvoice = {
  invoiceId: string;
  orderId: string;
  network: UsdtNetwork;
  token: "USDT";
  address: string;
  amount: string;
  status: "PENDING" | "PAID" | "EXPIRED";
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  transactionHash: string | null;
  payerAddress: string | null;
  receivedAmount: string | null;
};

function configuration() {
  const baseUrl = process.env.USDT_GATEWAY_URL?.replace(/\/+$/, "");
  const apiSecret = process.env.USDT_GATEWAY_API_SECRET;

  if (!baseUrl || !apiSecret) {
    throw new Error("USDT gateway configuration is missing.");
  }

  return { baseUrl, apiSecret };
}

async function gatewayRequest(path: string, init?: RequestInit) {
  const { baseUrl, apiSecret } = configuration();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Gateway-Secret": apiSecret,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as
    | (Partial<UsdtInvoice> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(result?.error ?? "USDT gateway request failed.");
  }

  return result as UsdtInvoice;
}

export function createUsdtInvoice(input: {
  orderId: string;
  network: UsdtNetwork;
  amount: number;
  callbackUrl?: string;
}) {
  return gatewayRequest("/v1/invoices", {
    method: "POST",
    body: JSON.stringify({
      orderId: input.orderId,
      network: input.network,
      amount: input.amount.toFixed(2),
      callbackUrl:
        input.callbackUrl ?? "https://www.ingamepin.com/api/usdt/webhook",
    }),
  });
}

export function getUsdtInvoice(invoiceId: string) {
  return gatewayRequest(`/v1/invoices/${encodeURIComponent(invoiceId)}`);
}
