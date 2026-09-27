export type StorePriceRates = { store_usd_inr_rate?: unknown; store_usd_rub_rate?: unknown };

export function calculateSupplierPrices(amounts: string[], currency: string, markup: string, settings: StorePriceRates) {
  if (!Array.isArray(amounts) || amounts.length < 1 || amounts.length > 50) throw new Error("Select between 1 and 50 denominations.");
  if (typeof markup !== "string" || !/^\d{1,4}(?:\.\d{1,2})?$/.test(markup) || Number(markup) > 1000) throw new Error("Enter a markup from 0% to 1000%, with at most two decimals.");
  const rawRate = currency === "USD" ? 1 : currency === "INR" ? settings.store_usd_inr_rate : currency === "RUB" ? settings.store_usd_rub_rate : null;
  const rate = typeof rawRate === "number" || typeof rawRate === "string" ? Number(rawRate) : NaN;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Save a valid website exchange rate for ${currency} in Payment Settings first.`);
  const prices: Record<string, string> = {};
  for (const amount of amounts) {
    if (typeof amount !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) throw new Error("Every face value must be a positive amount with at most two decimals.");
    const value = Number(amount) / rate * (1 + Number(markup) / 100);
    const rounded = Math.round((value + Number.EPSILON * Math.max(1, value)) * 100) / 100;
    if (!Number.isFinite(rounded) || rounded < 0.01 || rounded > 9999999.99) throw new Error("A calculated USD price is outside 0.01–9,999,999.99. Adjust the markup or enter prices manually.");
    prices[amount] = rounded.toFixed(2);
  }
  return { prices, rate, currency, markup: Number(markup) };
}
