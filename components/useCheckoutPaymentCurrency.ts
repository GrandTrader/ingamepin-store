"use client";

import { useEffect } from "react";
import { useStorePreferences } from "./StorePreferences";

// "upi" is the legacy manual-crypto ID; only manual_upi is rupee UPI.
export function getCheckoutPaymentCurrency(method: string | null | undefined) {
  switch (method?.toLowerCase()) {
    case "manual_upi":
    case "paytm":
      return "INR";
    case "pally":
    case "freekassa":
      return "RUB";
    case "upi":
    case "usdt":
    case "binance":
      return "USD";
    default:
      return null;
  }
}

export function useCheckoutPaymentCurrency(method: string | null | undefined) {
  const { currency, setCurrency } = useStorePreferences();
  const paymentCurrency = getCheckoutPaymentCurrency(method);

  useEffect(() => {
    if (paymentCurrency && currency !== paymentCurrency) {
      setCurrency(paymentCurrency);
    }
  }, [currency, paymentCurrency, setCurrency]);
}
