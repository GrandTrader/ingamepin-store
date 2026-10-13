import type { FKProduct } from "./fkwallet-types";

export type FKImportInput = {
  requestId: string; connectionId: string; supplierCategoryId: number;
  categoryId: string; title: string; titleRu: string; description: string; descriptionRu: string;
  region: string; markup: string; exchangeRate: string;
  options: { id: number; expectedCost: string; expectedCurrency: string; name: string;
    denomination: string; currency: string; optionType: "CURRENCY" | "OTHER"; price?: string }[];
};
export const fkUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

// Both the preview and the server use decimal arithmetic, rounding only the
// final USD price. The exchange rate always means supplier units per USD.
function decimal(value: unknown, places: number, label: string): bigint {
  if (typeof value !== "string" || value.length > 24 || !new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value)) throw new Error(`Enter a valid ${label}.`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
export function fkSellingPrice(cost: string, rate: string, markup: string): string {
  const supplier = decimal(cost, 8, "supplier cost"), exchange = decimal(rate, 8, "exchange rate"), percent = decimal(markup, 2, "markup percentage");
  if (supplier <= BigInt(0) || supplier > BigInt("10000000000000000")) throw new Error("The supplier price is unavailable.");
  if (exchange <= BigInt(0) || exchange > BigInt("10000000000000000")) throw new Error("Enter a positive exchange rate.");
  if (percent > BigInt(100000)) throw new Error("Markup must be between 0% and 1,000%.");
  const divisor = exchange * BigInt(100);
  const cents = (supplier * (BigInt(10000) + percent) + divisor / BigInt(2)) / divisor;
  if (cents < BigInt(1) || cents > BigInt(999999999)) throw new Error("Selling price must be between USD 0.01 and 9,999,999.99.");
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
export function fkPlainText(value: string): string {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(p|div|li)>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/<[^>]*>/g, "")
    .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
export type FKCustomerField = { key: string; label: string; placeholder: string; fieldType: "TEXT" | "EMAIL" | "NUMBER" | "TEXTAREA"; isRequired: boolean };
export function fkCustomerFields(item: FKProduct): FKCustomerField[] {
  if (!Array.isArray(item.fields) || item.fields.length > 10) throw new Error("This product needs a separate customer information form.");
  const seen = new Set<string>();
  return item.fields.map(input => {
    const fieldType = input.type?.toUpperCase();
    if (!fieldType || !["TEXT", "EMAIL", "NUMBER", "TEXTAREA"].includes(fieldType) || input.hasChoices || input.values?.length ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(input.key) || seen.has(input.key)) throw new Error("This product needs a separate customer information form.");
    seen.add(input.key);
    const label = fkPlainText(input.label || input.placeholder || input.key).slice(0, 80);
    if (!label) throw new Error("The supplier customer field needs a label before import.");
    // Match the existing FKWallet purchase flow: collect every supplier input
    // before validation, including Telegram's recipient username.
    return { key: input.key, label, placeholder: fkPlainText(input.placeholder || "").slice(0, 150),
      fieldType: fieldType as FKCustomerField["fieldType"], isRequired: true };
  }).sort((a, b) => a.key.localeCompare(b.key));
}
export function fkImportIssue(item: FKProduct): string {
  if (item.price <= 0 || (item.priceType && item.priceType !== "FIXED")) return "Variable-value product: a fixed supplier price is needed for this import.";
  try { fkCustomerFields(item); } catch (error) { return error instanceof Error ? error.message : "This product needs a separate customer information form."; }
  if (item.productType && item.productType !== "DEFAULT") return "This delivery type needs a separate product setup.";
  if (!/^[A-Z]{3}$/.test(item.currency)) return "This supplier currency is not supported for import.";
  return "";
}
export function parseFKSelection(value: unknown): number[] {
  if (typeof value !== "string" || value.length > 850 || !/^\d+(?:,\d+)*$/.test(value)) throw new Error("Select products from the FKWallet catalogue.");
  const ids = value.split(",").map(Number);
  if (ids.length > 50 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Select between 1 and 50 different supplier products.");
  return ids;
}
function field(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new Error(`${name} must contain ${min}–${max} characters.`);
  const clean = fkPlainText(value.trim());
  if (clean.length < min) throw new Error(`${name} is required.`);
  return clean;
}
export function prepareFKDraft(input: FKImportInput, products: FKProduct[]) {
  if (!input || !fkUuid(input.requestId) || !fkUuid(input.categoryId) || !Number.isSafeInteger(input.supplierCategoryId) || input.supplierCategoryId <= 0) throw new Error("Choose a valid category and import reference.");
  if (!Array.isArray(input.options) || input.options.length < 1 || input.options.length > 50) throw new Error("Select between 1 and 50 products.");
  const seen = new Set<number>(), currencies = new Set<string>();
  let customerFields: FKCustomerField[] | undefined;
  const options = input.options.map(row => {
    if (!row || seen.has(row.id)) throw new Error("Select each supplier product only once.");
    seen.add(row.id);
    const item = products.find(product => product.id === row.id);
    if (!item) throw new Error("A selected supplier product is no longer available. Reload the catalogue.");
    const issue = fkImportIssue(item); if (issue) throw new Error(issue);
    const fields = fkCustomerFields(item);
    if (customerFields && JSON.stringify(customerFields) !== JSON.stringify(fields)) throw new Error("These products need different customer information. Import them separately.");
    customerFields = fields;
    if (decimal(String(item.price), 8, "supplier cost") !== decimal(row.expectedCost, 8, "supplier cost") || item.currency !== row.expectedCurrency) throw new Error("A supplier price changed. Reload the import page and review the new price.");
    currencies.add(item.currency);
    if (item.currency === "USD" && Number(input.exchangeRate) !== 1) throw new Error("The exchange rate for USD supplier prices must be 1.");
    const suggested = fkSellingPrice(String(item.price), input.exchangeRate, input.markup);
    let price = suggested;
    if (row.price !== undefined && row.price !== "") {
      const cents = decimal(row.price, 2, "selling price");
      if (cents < BigInt(1) || cents > BigInt(999999999)) throw new Error("Selling price must be between USD 0.01 and 9,999,999.99.");
      price = `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
    }
    if (!["CURRENCY", "OTHER"].includes(row.optionType)) throw new Error("Choose a valid option type.");
    const denomination = decimal(row.denomination, 4, "denomination");
    if (denomination < BigInt(1) || denomination > BigInt("10000000000000")) throw new Error("Enter a positive denomination up to 1,000,000,000.");
    if (typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)) throw new Error("Use a three-letter denomination currency.");
    return { supplierId: item.id, name: field(row.name, "Option name", 1, 150), denomination: row.denomination,
      currency: row.currency, optionType: row.optionType, price, supplierCost: String(item.price), supplierCurrency: item.currency,
      supplierSnapshot: item };
  });
  if (currencies.size !== 1) throw new Error("Import products with the same supplier currency together.");
  return { title: field(input.title, "English title", 2, 150), titleRu: field(input.titleRu, "Russian title", 0, 150),
    description: field(input.description, "English description", 0, 5000), descriptionRu: field(input.descriptionRu, "Russian description", 0, 5000),
    region: field(input.region, "Region", 1, 100), markup: input.markup, exchangeRate: input.exchangeRate, customerFields, options };
}
