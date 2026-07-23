const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1";

type NowPaymentsError = {
  message?: string;
};

export type NowPaymentsInvoice = {
  id: string;
  invoice_url: string;
  order_id: string;
  price_amount: string;
  price_currency: string;
};

function apiKey() {
  const value = process.env.NOWPAYMENTS_API_KEY;
  if (!value) throw new Error("NOWPayments API key is missing.");
  return value;
}

export async function createNowPaymentsInvoice(body: {
  price_amount: number;
  order_id: string;
  order_description: string;
  ipn_callback_url: string;
  success_url: string;
  cancel_url: string;
}) {
  const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify({
      ...body,
      price_currency: "usd",
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    }),
    cache: "no-store",
  });
  const result = (await response.json()) as
    | NowPaymentsInvoice
    | NowPaymentsError;

  if (!response.ok || !("invoice_url" in result) || !result.invoice_url) {
    throw new Error(
      ("message" in result && result.message) ||
        `NOWPayments request failed (${response.status}).`,
    );
  }

  return result;
}
