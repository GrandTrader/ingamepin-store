/** Currency handling shared by the supplier checks and future order integration. */
export type SupplierMoney = { currency: string; amount: string };

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Definite Play ${field}`);
  }
  return value as Record<string, unknown>;
}

function currencyCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new Error("Missing or invalid supplier currency");
  }
  return value.trim().toUpperCase();
}

export function supplierMoney(currency: unknown, amount: unknown): SupplierMoney {
  if (typeof amount !== "string") {
    throw new Error("Supplier amount must be a decimal string");
  }
  const text = amount.trim();
  // Both ungrouped balances and grouped order-response amounts are documented.
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(text)) {
    throw new Error("Invalid supplier amount");
  }
  const plain = text.replaceAll(",", "");
  const negative = plain.startsWith("-");
  const [whole, fraction = ""] = plain.replace(/^-/, "").split(".");
  const integer = BigInt(whole).toString();
  const decimal = fraction.replace(/0+$/, "").padEnd(2, "0");
  const isZero = integer === "0" && !/[1-9]/.test(decimal);
  return {
    currency: currencyCode(currency),
    amount: `${negative && !isZero ? "-" : ""}${integer}.${decimal}`,
  };
}

function scaled(money: SupplierMoney): bigint {
  const negative = money.amount.startsWith("-");
  const [whole, fraction] = money.amount.replace(/^-/, "").split(".");
  const units = BigInt(whole + fraction.padEnd(8, "0"));
  return negative ? -units : units;
}

function moneyMap(value: unknown, field: string): SupplierMoney[] {
  if (value === undefined) return [];
  const entries = Object.entries(record(value, field)).map(([currency, amount]) =>
    supplierMoney(currency, amount),
  );
  if (new Set(entries.map((entry) => entry.currency)).size !== entries.length) {
    throw new Error(`Duplicate currency in ${field}`);
  }
  return entries;
}

export function readSupplierBalances(payload: unknown, displayCurrency = "USD") {
  const balances = record(record(payload, "response").Balances, "Balances");
  // Balance/Total/Outstanding are aliases, not balances to add together.
  const accountBalances = moneyMap(
    balances.Balance ?? balances.Total ?? balances.Outstanding,
    "Balance",
  );
  const available = moneyMap(balances["Available Balance"], "Available Balance");
  if (available.length > 1) {
    throw new Error("Expected one supplier available-balance currency");
  }
  const currency = currencyCode(displayCurrency);
  return {
    accountBalances,
    accountBalance: accountBalances.find((entry) => entry.currency === currency) ?? null,
    availableBalance: available[0] ?? null,
    // No conversion rate is inferred from these two different accounting measures.
    availableMatchesDisplayCurrency: available[0]?.currency === currency,
  };
}

export function readSupplierPrice(stockItem: unknown): SupplierMoney {
  const item = record(stockItem, "stock item");
  // cardcurrency describes the voucher face value, not its acquisition cost.
  const money = supplierMoney(item.currency, item.price);
  if (scaled(money) < BigInt(0)) throw new Error("Negative supplier product price");
  return money;
}

export function assessSupplierFunds(
  snapshot: ReturnType<typeof readSupplierBalances>,
  orderCost: SupplierMoney,
): { status: "sufficient" | "insufficient" | "unknown"; reason: string } {
  const cost = supplierMoney(orderCost.currency, orderCost.amount);
  if (scaled(cost) <= BigInt(0)) throw new Error("Order cost must be positive");
  const available = snapshot.availableBalance;
  if (!available) return { status: "unknown", reason: "missing_available_balance" };
  // The provider documents negative available credit as an order block.
  if (scaled(available) < BigInt(0)) {
    return { status: "insufficient", reason: "supplier_over_credit_limit" };
  }
  if (available.currency !== cost.currency) {
    return { status: "unknown", reason: "different_currencies" };
  }
  return scaled(available) >= scaled(cost)
    ? { status: "sufficient", reason: "same_currency_balance" }
    : { status: "insufficient", reason: "same_currency_balance" };
}
