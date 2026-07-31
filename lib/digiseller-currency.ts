type SupportedDigisellerCurrency = "USD" | "RUB" | "EUR";

type CoinbaseExchangeRatesResponse = {
  data?: {
    currency?: string;
    rates?: Record<string, string>;
  };
};

export type DigisellerUsdConversion = {
  originalAmount: number;
  originalCurrency: SupportedDigisellerCurrency;
  usdAmount: number;
  originalUnitsPerUsd: number;
};

const SUPPORTED_CURRENCIES = new Set<SupportedDigisellerCurrency>([
  "USD",
  "RUB",
  "EUR",
]);

export function isSupportedDigisellerCurrency(
  currency: string,
): currency is SupportedDigisellerCurrency {
  return SUPPORTED_CURRENCIES.has(currency as SupportedDigisellerCurrency);
}

function roundUpUsd(value: number) {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

export async function convertDigisellerAmountToUsd(
  amount: string,
  currency: SupportedDigisellerCurrency,
): Promise<DigisellerUsdConversion> {
  const originalAmount = Number(amount);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw new Error("Invalid Digiseller amount.");
  }

  if (currency === "USD") {
    return {
      originalAmount,
      originalCurrency: currency,
      usdAmount: Number(originalAmount.toFixed(2)),
      originalUnitsPerUsd: 1,
    };
  }

  const response = await fetch(
    "https://api.coinbase.com/v2/exchange-rates?currency=USD",
    {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 900,
      },
      signal: AbortSignal.timeout(5000),
    },
  );

  if (!response.ok) {
    throw new Error("Currency conversion service is temporarily unavailable.");
  }

  const payload = (await response.json()) as CoinbaseExchangeRatesResponse;
  const originalUnitsPerUsd = Number(payload.data?.rates?.[currency]);
  if (
    payload.data?.currency !== "USD" ||
    !Number.isFinite(originalUnitsPerUsd) ||
    originalUnitsPerUsd <= 0
  ) {
    throw new Error(`Unable to convert ${currency} to USD.`);
  }

  const usdAmount = roundUpUsd(originalAmount / originalUnitsPerUsd);
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error("Converted payment amount is invalid.");
  }

  return {
    originalAmount,
    originalCurrency: currency,
    usdAmount,
    originalUnitsPerUsd,
  };
}