export const SUPPLIERS = { DEFINITEPLAY: "Definite Play", WUPEX: "Wupex", FKWALLET: "FKWallet" } as const;
export type SupplierProvider = keyof typeof SUPPLIERS;
export type SupplierChoice = {
  key: string; name: string; cost: string; costCurrency: string; region: string;
  denomination: string; currency: string; kind: "CODE" | "ACCOUNT";
};
export type SupplierSelection = {
  provider: SupplierProvider; query: string; category: string; region: string;
  markup: string; exchangeRate: string; deliveryKind: "CODE" | "ACCOUNT";
  options: { key: string; optionId: string | null; name: string; denomination: string; currency: string }[];
};
export type SupplierSetup = {
  provider: string; version: string; markup: string; exchangeRate: string;
  selection: SupplierSelection | null;
  options: { id: string; name: string; denomination: string; currency: string; active: boolean }[];
};
export type SupplierPreview = {
  token: string; version: string; selection: SupplierSelection;
  options: { name: string; denomination: string; currency: string; cost: string; costCurrency: string; price: string }[];
  hiddenCount: number; recipientFields: string[];
};
export function isSupplier(value: unknown): value is SupplierProvider {
  return typeof value === "string" && Object.hasOwn(SUPPLIERS, value);
}
export function validateSupplierSelection(value: SupplierSelection) {
  if (!value || !isSupplier(value.provider) || typeof value.query !== "string" || value.query.length > 150 ||
      typeof value.category !== "string" || value.category.length > 200 || typeof value.region !== "string" || value.region.length > 100 ||
      !["CODE", "ACCOUNT"].includes(value.deliveryKind) || !Array.isArray(value.options) || value.options.length < 1 || value.options.length > 50)
    throw new Error("Select between 1 and 50 denominations from the supplier catalogue.");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value.markup) || Number(value.markup) > 1000 ||
      !/^\d{1,9}(\.\d{1,8})?$/.test(value.exchangeRate) || Number(value.exchangeRate) <= 0 || Number(value.exchangeRate) > 100000000)
    throw new Error("Enter a valid markup and supplier currency exchange rate.");
  const keys = new Set<string>(), ids = new Set<string>();
  for (const option of value.options) {
    if (!option || typeof option.key !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(option.key) || keys.has(option.key) ||
        typeof option.name !== "string" || !option.name.trim() || option.name.length > 150 ||
        typeof option.denomination !== "string" || !/^\d+(\.\d{1,4})?$/.test(option.denomination) || Number(option.denomination) <= 0 || Number(option.denomination) > 1e9 ||
        typeof option.currency !== "string" || !/^[A-Z]{3}$/.test(option.currency) ||
        (option.optionId !== null && (typeof option.optionId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(option.optionId) || ids.has(option.optionId))))
      throw new Error("Check the denomination names, values and mappings. Each existing option can be matched once.");
    keys.add(option.key); if (option.optionId) ids.add(option.optionId);
  }
  return value;
}

/** Preserve existing stock links only when one exact value/currency match exists. */
export function matchingSupplierOption(item: SupplierChoice, options: SupplierSetup["options"], selected: SupplierSelection["options"]): string | null {
  if (!item.denomination || !item.currency || Number(item.denomination) <= 0) return null;
  const matches = options.filter(option => Number(option.denomination) === Number(item.denomination) && option.currency === item.currency);
  return matches.length === 1 && !selected.some(option => option.optionId === matches[0].id) ? matches[0].id : null;
}
