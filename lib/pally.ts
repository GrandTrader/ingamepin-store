const PALLY_API_URL = "https://pal24.pro/api/v1";
const DEFAULT_USD_RUB_RATE = 85;

function getPallyToken() {
  const token = process.env.PALLY_API_TOKEN?.trim();
  if (!token) throw new Error("Pally API token is missing.");
  return token;
}

export function getPallyShopId() {
  const shopId = process.env.PALLY_SHOP_ID?.trim();
  if (!shopId) throw new Error("Pally Shop ID is missing.");
  return shopId;
}

export function getPallyApiToken() {
  return getPallyToken();
}

type CreatePallyBillInput = {
  amount: number;
  currency: "RUB";
  orderId: string;
  name: string;
  description: string;
  payerEmail: string;
  items: Array<{
    name: string;
    price: string;
    category: string;
    quantity: string;
    extra: Record<string, string>;
  }>;
};

type PallyBillResponse = {
  success?: boolean | string;
  link_page_url?: string;
  bill_id?: string;
  message?: string;
  error?: string;
};

export async function getUsdRubRate() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const result = await createAdminClient()
    .from("payment_gateway_settings")
    .select("pally_usd_rub_rate")
    .eq("id", true)
    .maybeSingle();
  const rate = Number(result.data?.pally_usd_rub_rate);

  if (result.error || !Number.isFinite(rate) || rate <= 0) {
    return DEFAULT_USD_RUB_RATE;
  }

  return rate;
}

type PallyBillStatusResponse = {
  success?: boolean | string;
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number | string;
  currency_in?: string;
};

export async function getPallyBillStatus(billId: string) {
  const response = await fetch(
    `${PALLY_API_URL}/bill/status?id=${encodeURIComponent(billId)}`,
    {
      headers: {
        Authorization: `Bearer ${getPallyToken()}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  const result = (await response.json()) as PallyBillStatusResponse;

  if (!response.ok || String(result.success).toLowerCase() !== "true") {
    throw new Error("Unable to verify the Pally bill.");
  }

  return result;
}

export async function createPallyBill(input: CreatePallyBillInput) {
  const form = new URLSearchParams({
    amount: input.amount.toFixed(2),
    shop_id: getPallyShopId(),
    order_id: input.orderId,
    name: input.name,
    description: input.description,
    type: "normal",
    currency_in: input.currency,
    payer_email: input.payerEmail,
  });

  input.items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    form.set(`${prefix}[name]`, item.name);
    form.set(`${prefix}[price]`, item.price);
    form.set(`${prefix}[category]`, item.category);
    form.set(`${prefix}[quantity]`, item.quantity);

    Object.entries(item.extra).forEach(([key, value]) => {
      form.set(`${prefix}[extra][${key}]`, value);
    });
  });

  const response = await fetch(`${PALLY_API_URL}/bill/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPallyToken()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const result = (await response.json()) as PallyBillResponse;

  if (
    !response.ok ||
    String(result.success).toLowerCase() !== "true" ||
    !result.link_page_url ||
    !result.bill_id
  ) {
    throw new Error(
      result.message ||
        result.error ||
        `Pally request failed (${response.status}).`,
    );
  }

  return {
    checkoutUrl: result.link_page_url,
    billId: String(result.bill_id),
  };
}
