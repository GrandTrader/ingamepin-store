export type SubmittedProductOption = {
  id: string;
  name: string;
  denomination: number;
  currency: string;
  sellingPrice: number;
  isActive: boolean;
  isInStock: boolean;
};

function inputNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return NaN;
  return Number(value);
}

export function parseProductOptions(payload: string): SubmittedProductOption[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Product options are invalid.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50) {
    throw new Error("Keep between 1 and 50 product options.");
  }
  return parsed.map((value: unknown, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Option ${index + 1} is invalid.`);
    }
    const option = value as Record<string, unknown>;
    const name = typeof option.name === "string" ? option.name.trim() : "";
    const currency = typeof option.currency === "string" ? option.currency : "";
    const denomination = inputNumber(option.denomination);
    const sellingPrice = inputNumber(option.sellingPrice);
    const label = `Option ${index + 1}${name ? ` (${name})` : ""}`;
    if (!name) throw new Error(`${label}: enter an option name.`);
    if (!Number.isInteger(denomination) || denomination <= 0) {
      throw new Error(`${label}: enter a positive whole-number denomination.`);
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`${label}: select a valid currency.`);
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      throw new Error(`${label}: enter a valid selling price of zero or more.`);
    }
    if (typeof option.id !== "string" || typeof option.isActive !== "boolean" ||
        (option.isInStock !== undefined && typeof option.isInStock !== "boolean")) {
      throw new Error(`${label}: product option settings are invalid.`);
    }
    return { id: option.id, name, denomination, currency, sellingPrice,
      isActive: option.isActive, isInStock: option.isInStock !== false };
  });
}
